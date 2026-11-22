import {
  WorkError,
  type Abandon,
  type AbortPublication,
  type CreatedWorkResult,
  type FromHaunting,
  type ApplyAnswer,
  type BeginPublication,
  type CanonicalWorkRef,
  type ClaimFix,
  type ClaimResult,
  type FinishAttempt,
  type FixResult,
  type Heartbeat,
  type HeartbeatResult,
  type RecordPublication,
  type SaveQuestion,
  type SaveTriage,
  type TriageSaveResult,
  type WorkCaller,
  type WorkOutcome,
  type WorkRequest,
  type WorkSnapshot,
} from '@graveshift/work';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { subHours } from 'date-fns';
import type { WorkItem } from '@graveshift/core';

import { AuditRepo } from '../audit/audit.repo';
import { inAuditTransaction } from '../audit/audit.transaction';
import { PrismaService } from '../infra/prisma.service';
import { ProjectGrant } from '../internal/project-grant';
import { hauntingWorkId, type HauntingWork } from './work-haunting.mapper';
import { claimFix, saveTriage } from './work-item.admission';
import { toWorkItem, workAudit } from './work-item.mapper';
import { WORK_AGENTS, type WorkAgents } from './work-item.policy';
import { beginPublication, finishAttempt, recordPublication } from './work-item.publication';
import { applyAnswer, saveQuestion } from './work-item.questions';
import { abandon, abortPublication, heartbeat } from './work-item.recovery';
import { WORK_ITEM_SELECT } from './work-item.select';
import { commandReceipt, loadWork, recordedOutcome } from './work-item.state';
import type { WorkItemListResponse, WorkListQuery, WorkStateCall } from './work-item.types';

@Injectable()
export class WorkItemRepo {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepo,
    @Inject(WORK_AGENTS) private readonly agents: WorkAgents,
    private readonly grant: ProjectGrant,
  ) {}

  private async project(projectId: string): Promise<void> {
    try {
      await this.grant.assert(projectId);
    } catch {
      throw new WorkError('PROJECT_FORBIDDEN', 'This project is not granted to this integration');
    }
  }

  async findByHaunting(projectId: string, incidentId: string): Promise<WorkItem | undefined> {
    await this.project(projectId);
    const row = await this.prisma.workItem.findFirst({
      where: { projectId, id: hauntingWorkId(projectId, incidentId) },
      select: WORK_ITEM_SELECT,
    });
    return row === null ? undefined : toWorkItem(row);
  }

  async createFromHaunting(
    input: FromHaunting,
    prepared: HauntingWork,
  ): Promise<CreatedWorkResult> {
    await this.project(input.projectId);
    const id = hauntingWorkId(input.projectId, input.incidentId);
    if (id !== prepared.item.id || prepared.diagnosis.incidentId !== input.incidentId) {
      throw new WorkError('INVALID_OUTCOME', 'The Work item must refer to the verified Haunting');
    }
    return inAuditTransaction(this.prisma, async (tx) => {
      const { draftPr, ...item } = prepared.item;
      const created = await tx.workItem.createMany({
        data: {
          ...item,
          projectId: input.projectId,
          startDate: null,
          dueDate: null,
          draftPr: draftPr ?? Prisma.DbNull,
          diagnosis: prepared.diagnosis,
        },
        skipDuplicates: true,
      });
      const current = await loadWork(tx, { projectId: input.projectId, id });
      if (created.count !== 0)
        await this.audit.appendInTx(tx, input.projectId, {
          key: `work:created:${id}`,
          actor: 'wraith',
          type: 'work.created',
          incidentId: input.incidentId,
          payload: { workItemId: id, eventId: input.eventId },
        });
      return { item: current.item, created: created.count !== 0 };
    });
  }

  async publicationCount(projectId: string): Promise<number> {
    await this.project(projectId);
    // Later recovery updates keep an old publication in this conservative admission window.
    return this.prisma.fixAttempt.count({
      where: {
        projectId,
        publication: { not: Prisma.AnyNull },
        updatedAt: { gte: subHours(new Date(), 1) },
      },
    });
  }

  async list(projectId: string, query: WorkListQuery): Promise<WorkItemListResponse> {
    await this.project(projectId);
    const { offset, limit, ...filters } = query;
    const where = { projectId, ...filters } satisfies Prisma.WorkItemWhereInput;
    return this.prisma.$transaction(
      async (tx) => {
        const [rows, total] = await Promise.all([
          tx.workItem.findMany({
            where,
            orderBy: [{ fixPriority: 'asc' }, { title: 'asc' }, { id: 'asc' }],
            skip: offset,
            take: limit,
            select: WORK_ITEM_SELECT,
          }),
          tx.workItem.count({ where }),
        ]);
        return { items: rows.map(toWorkItem), total, offset, limit };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async read(ref: CanonicalWorkRef): Promise<WorkSnapshot> {
    await this.project(ref.projectId);
    return this.prisma.$transaction((tx) => loadWork(tx, ref), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  async replay({
    caller,
    id,
    input: request,
  }: WorkStateCall<WorkRequest>): Promise<WorkOutcome | null> {
    await this.project(caller.projectId);
    return inAuditTransaction(this.prisma, async (tx) => {
      await this.lockCommand(tx, caller);
      const receipt = await commandReceipt(tx, caller, id, request);
      if (receipt === null) return null;
      const outcome = recordedOutcome(receipt);
      if (outcome === null && receipt.attemptId !== null) {
        throw new WorkError('COMMAND_IN_PROGRESS', 'This command already has a Fix attempt');
      }
      return outcome;
    });
  }

  saveTriage({ caller, id, input }: WorkStateCall<SaveTriage>): Promise<TriageSaveResult> {
    return this.change(caller, (tx) => saveTriage(tx, this.audit, this.agents, caller, id, input));
  }

  claim({ caller, id, input }: WorkStateCall<ClaimFix>): Promise<ClaimResult> {
    return this.change(caller, (tx) => claimFix(tx, this.audit, this.agents, caller, id, input));
  }

  saveQuestion({ caller, id, input }: WorkStateCall<SaveQuestion>): Promise<FixResult> {
    return this.change(caller, (tx) =>
      saveQuestion(tx, this.audit, this.agents, caller, id, input),
    );
  }

  applyAnswer({ caller, id, input }: WorkStateCall<ApplyAnswer>): Promise<ClaimResult> {
    return this.change(caller, (tx) => applyAnswer(tx, this.audit, this.agents, caller, id, input));
  }

  beginPublication({ caller, id, input }: WorkStateCall<BeginPublication>): Promise<WorkSnapshot> {
    return this.change(caller, (tx) => beginPublication(tx, this.audit, caller, id, input));
  }

  async recordPublication({
    caller,
    id,
    input,
  }: WorkStateCall<RecordPublication>): Promise<WorkSnapshot> {
    const snapshot = await this.change(caller, (tx) => recordPublication(tx, caller, id, input));
    // The pre-effect intent is audited. Retain the known remote result before this later handoff.
    await this.audit.append(
      caller.projectId,
      workAudit(caller, id, 'publication_recorded', {
        version: snapshot.version,
        attemptId: input.attemptId,
        state: 'publishing',
      }),
    );
    return snapshot;
  }

  finish({ caller, id, input }: WorkStateCall<FinishAttempt>): Promise<FixResult> {
    return this.change(caller, (tx) => finishAttempt(tx, this.audit, caller, id, input));
  }

  heartbeat({ caller, id, input }: WorkStateCall<Heartbeat>): Promise<HeartbeatResult> {
    return this.change(caller, (tx) => heartbeat(tx, caller, id, input));
  }

  abandon({ caller, id, input }: WorkStateCall<Abandon>): Promise<FixResult> {
    return this.change(caller, (tx) => abandon(tx, this.audit, caller, id, input));
  }

  abortPublication({ caller, id, input }: WorkStateCall<AbortPublication>): Promise<FixResult> {
    return this.change(caller, (tx) => abortPublication(tx, this.audit, caller, id, input));
  }

  private async lockCommand(tx: Prisma.TransactionClient, caller: WorkCaller): Promise<void> {
    const owner = JSON.stringify(['work-command', caller.projectId, caller.commandId]);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${owner}, 0))::text`;
  }

  private async change<Result>(
    caller: WorkCaller,
    task: (tx: Prisma.TransactionClient) => Promise<Result>,
  ): Promise<Result> {
    await this.project(caller.projectId);
    return inAuditTransaction(this.prisma, async (tx) => {
      await this.lockCommand(tx, caller);
      return task(tx);
    });
  }
}
