import type { AuditDraft, AuditEntry } from '@graveshift/core';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../infra/prisma.service';
import { AuditConflict } from './audit.errors';
import { auditFacts, normalizeDraft, toAuditEntry } from './audit.mapper';
import { AUDIT_SELECT } from './audit.select';
import { inAuditTransaction } from './audit.transaction';
import type { AuditPage, PolicyUsage, UsageRow, VerifyResult } from './audit.types';
import { parsePolicyUsage, usageQuery } from './audit.usage';
import { GENESIS_HASH, hashEntry, verifyEntries } from './chain';

@Injectable()
export class AuditRepo {
  constructor(private readonly prisma: PrismaService) {}

  append(projectId: string, draft: AuditDraft): Promise<AuditEntry> {
    const normalized = normalizeDraft(draft);
    return inAuditTransaction(this.prisma, (tx) => this.appendInTx(tx, projectId, normalized));
  }

  /** Repositories only. The caller owns a serializable, retryable transaction and commit. */
  async appendInTx(
    tx: Prisma.TransactionClient,
    projectId: string,
    input: AuditDraft,
  ): Promise<AuditEntry> {
    const draft = normalizeDraft(input);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${projectId}, 0))::text`;
    const prior = await tx.auditEntry.findUnique({
      where: { projectId_eventKey: { projectId, eventKey: draft.key } },
      select: AUDIT_SELECT,
    });
    if (prior) {
      const entry = toAuditEntry(prior);
      if (auditFacts(entry) !== auditFacts(draft)) throw new AuditConflict();
      return entry;
    }
    const head = await tx.auditEntry.findFirst({
      where: { projectId },
      orderBy: { seq: 'desc' },
      select: AUDIT_SELECT,
    });
    const prevHash = head?.hash ?? GENESIS_HASH;
    const entry = {
      seq: (head?.seq ?? 0) + 1,
      at: new Date().toISOString(),
      actor: draft.actor,
      type: draft.type,
      ...(draft.incidentId === undefined ? {} : { incidentId: draft.incidentId }),
      payload: draft.payload,
    };
    const row = await tx.auditEntry.create({
      data: {
        ...entry,
        at: new Date(entry.at),
        projectId,
        eventKey: draft.key,
        prevHash,
        hash: hashEntry(entry, prevHash),
      },
      select: AUDIT_SELECT,
    });
    return toAuditEntry(row);
  }

  async list(
    projectId: string,
    { afterSeq = 0, limit = 100 }: AuditPage = {},
  ): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditEntry.findMany({
      where: { projectId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      take: limit,
      select: AUDIT_SELECT,
    });
    return rows.map(toAuditEntry);
  }

  async verifyChain(projectId: string): Promise<VerifyResult> {
    const rows = await this.prisma.auditEntry.findMany({
      where: { projectId },
      orderBy: { seq: 'asc' },
      select: AUDIT_SELECT,
    });
    return verifyEntries(rows.map(toAuditEntry));
  }

  async policyUsage(projectId: string, service: string, incidentId: string): Promise<PolicyUsage> {
    const rows = await this.prisma.$queryRaw<UsageRow[]>(
      usageQuery(projectId, service, incidentId),
    );
    return parsePolicyUsage(rows);
  }
}
