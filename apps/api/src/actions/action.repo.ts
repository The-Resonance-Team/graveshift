import * as claims from '@graveshift/actuator/claims';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { subMinutes } from 'date-fns';

import { AuditRepo } from '../audit/audit.repo';
import * as config from '../config/boot.config';
import { PrismaService } from '../infra/prisma.service';
import { ProjectGrant } from '../internal/project-grant';
import { ActionProjectError } from './action.errors';
import { ACTION_CLAIM_SELECT } from './action.select';
import type { ClaimActionDto } from './dto/claim-action.dto';
import type { CompleteActionDto } from './dto/complete-action.dto';

@Injectable()
export class ActionRepo {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepo,
    @Inject(config.BOOT_CONFIG) private readonly boot: Pick<
      config.RootBootConfig,
      'policy' | 'mode'
    >,
    private readonly grant: ProjectGrant,
  ) {}

  claim(input: ClaimActionDto): Promise<claims.ClaimResult> {
    return this.change(input.projectId, async (tx, at) => {
      const { request, requestHash } = input.claim;
      const { action, approval } = request;
      if (requestHash !== claims.requestHash(request))
        return { kind: 'denied', reason: 'request_hash_mismatch' };
      const prior = await tx.actionClaim.findFirst({
        where: {
          projectId: input.projectId,
          OR: [{ tokenId: approval.tokenId }, { actionId: action.id }],
        },
        select: ACTION_CLAIM_SELECT,
      });
      if (prior) {
        if (prior.requestHash !== requestHash || prior.tokenId !== approval.tokenId)
          return { kind: 'uncertain' };
        const result = claims.RuntimeOutcomeSchema.safeParse(prior.result);
        return prior.state === 'completed' && result.success
          ? { kind: 'known', result: result.data }
          : { kind: 'uncertain' };
      }
      const invalid = claims.approvalReason(request, this.boot.policy, at.getTime());
      if (invalid) return { kind: 'denied', reason: invalid };
      const count = await tx.actionClaim.count({
        where: {
          projectId: input.projectId,
          service: action.service,
          OR: [{ admittedAt: { gt: subMinutes(at, 10) } }, { state: 'admitted' }],
        },
      });
      const denied = claims.runtimeDecision(this.boot.policy, request, count, this.boot.mode);
      if (denied) return { kind: 'denied', reason: denied };
      await tx.actionClaim.create({
        data: {
          projectId: input.projectId,
          tokenId: approval.tokenId,
          actionId: action.id,
          requestHash,
          service: action.service,
          incidentId: action.incidentId,
          state: 'admitted',
          admittedAt: at,
          expiresAt: new Date(approval.expiresAt),
        },
        select: { tokenId: true },
      });
      await this.audit.appendInTx(tx, input.projectId, claims.claimAudit(input.claim));
      return { kind: 'claimed' };
    });
  }

  complete(input: CompleteActionDto): Promise<claims.CompletionResult> {
    return this.change(input.projectId, async (tx, at) => {
      const completion = input.completion;
      const where = { projectId: input.projectId, tokenId: completion.tokenId };
      const prior = await tx.actionClaim.findUnique({
        where: { projectId_tokenId: where },
        select: ACTION_CLAIM_SELECT,
      });
      if (
        !prior ||
        prior.actionId !== completion.actionId ||
        prior.requestHash !== completion.requestHash
      ) {
        return { kind: 'uncertain' };
      }
      if (prior.state === 'completed') {
        const result = claims.RuntimeOutcomeSchema.safeParse(prior.result);
        return result.success ? { kind: 'known', result: result.data } : { kind: 'uncertain' };
      }
      const updated = await tx.actionClaim.updateMany({
        where: { ...where, state: 'admitted', requestHash: completion.requestHash },
        data: { state: 'completed', result: completion.result, completedAt: at },
      });
      if (updated.count !== 1) return { kind: 'uncertain' };
      await this.audit.appendInTx(
        tx,
        input.projectId,
        claims.completionAudit(completion, prior.service, prior.incidentId),
      );
      return { kind: 'completed' };
    });
  }

  private async change<Result>(
    projectId: string,
    task: (tx: Prisma.TransactionClient, at: Date) => Promise<Result>,
  ): Promise<Result> {
    try {
      await this.grant.assert(projectId);
    } catch {
      throw new ActionProjectError();
    }
    return this.prisma.$transaction(
      async (tx) => {
        // Acquire the Audit chain project lock first. ReadCommitted then reads the latest committed claims after a wait.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${projectId}, 0))::text`;
        const [clock] = await tx.$queryRaw<Array<{ at: Date }>>`SELECT clock_timestamp() AS at`;
        if (!clock) throw new Error('Database clock is unavailable');
        return task(tx, clock.at);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 15_000,
      },
    );
  }
}
