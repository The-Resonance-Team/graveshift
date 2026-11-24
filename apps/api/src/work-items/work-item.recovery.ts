import { PrRefSchema } from '@graveshift/core';
import { redact } from '@graveshift/redactor';
import {
  FixResultSchema,
  WorkError,
  WORK_LEASE_MS,
  type Abandon,
  type AbortPublication,
  type FixResult,
  type Heartbeat,
  type HeartbeatResult,
  type WorkCaller,
} from '@graveshift/work';
import { Prisma } from '@prisma/client';
import { addMilliseconds } from 'date-fns';

import type { AuditSink } from '../audit/audit.sink';
import { assertWorker, databaseNow } from './work-item.lease';
import { workAudit } from './work-item.mapper';
import { recordResult, requireCommand } from './work-item.receipts';
import {
  activeAttempt,
  commandReceipt,
  fenceAttempt,
  fenceWork,
  loadWork,
} from './work-item.state';

export async function heartbeat(
  tx: Prisma.TransactionClient,
  caller: WorkCaller,
  id: string,
  input: Heartbeat,
): Promise<HeartbeatResult> {
  if (caller.workerId !== undefined && caller.workerId !== input.workerId)
    return { renewed: false };
  const receipt = await commandReceipt(tx, caller, id);
  if (receipt?.attemptId !== input.attemptId) return { renewed: false };
  const snapshot = await loadWork(tx, { projectId: caller.projectId, id });
  const attempt = snapshot.activeAttempt;
  if (attempt?.id !== input.attemptId || attempt.workerId !== input.workerId)
    return { renewed: false };
  const now = await databaseNow(tx);
  const changed = await tx.fixAttempt.updateMany({
    where: {
      projectId: caller.projectId,
      id: input.attemptId,
      workItemId: id,
      workerId: input.workerId,
      state: { in: ['claimed', 'running', 'publishing'] },
      leaseUntil: { gt: now },
      workItem: { is: { projectId: caller.projectId, id, activeAttemptId: input.attemptId } },
    },
    data: {
      leaseUntil: addMilliseconds(now, WORK_LEASE_MS),
      updatedAt: new Date(attempt.updatedAt),
    },
  });
  return { renewed: changed.count === 1 };
}

export async function abandon(
  tx: Prisma.TransactionClient,
  audit: AuditSink,
  caller: WorkCaller,
  id: string,
  input: Abandon,
): Promise<FixResult> {
  const snapshot = await loadWork(tx, { projectId: caller.projectId, id });
  const attempt = activeAttempt(snapshot, input, ['claimed', 'running']);
  await requireCommand(tx, caller, id, attempt);
  const now = await databaseNow(tx);
  if (attempt.leaseUntil === null || new Date(attempt.leaseUntil) > now) {
    throw new WorkError('LEASE_ACTIVE', 'The Fix attempt still has an execution lease');
  }
  if (attempt.publication !== null) {
    throw new WorkError('INVALID_OUTCOME', 'A publication must be reconciled');
  }
  const result = FixResultSchema.parse({
    item: snapshot.item,
    trigger: attempt.trigger,
    attemptId: attempt.id,
    ok: false,
    effect: 'deny',
    pr: null,
    reason: 'Execution interrupted before publication',
    failure: 'fix_error',
    routing: null,
  });
  await fenceWork(tx, caller, id, snapshot, { activeAttemptId: null });
  await fenceAttempt(
    tx,
    caller,
    attempt,
    { state: 'failed', result, leaseUntil: null },
    {
      leaseUntil: { lte: now },
      publication: { equals: Prisma.DbNull },
    },
  );
  await recordResult(tx, caller, id, result);
  await audit.appendInTx(
    tx,
    caller.projectId,
    workAudit(caller, id, 'abandoned', {
      version: snapshot.version + 1,
      attemptId: attempt.id,
      state: 'failed',
    }),
  );
  return result;
}

export async function abortPublication(
  tx: Prisma.TransactionClient,
  audit: AuditSink,
  caller: WorkCaller,
  id: string,
  input: AbortPublication,
): Promise<FixResult> {
  const snapshot = await loadWork(tx, { projectId: caller.projectId, id });
  const attempt = activeAttempt(snapshot, input, ['publishing']);
  await requireCommand(tx, caller, id, attempt);
  assertWorker(attempt, caller);
  const outcome = input.outcome;
  if (
    attempt.publication === null ||
    PrRefSchema.safeParse(attempt.publication).success ||
    outcome.ok ||
    outcome.pr !== null ||
    ['publication_uncertain', 'awaiting_answer', 'needs_human'].includes(outcome.failure) ||
    (outcome.routing !== null && outcome.routing.kind !== 'routed')
  ) {
    throw new WorkError(
      'INVALID_OUTCOME',
      'Only a known failure before publication can release its intent',
    );
  }
  const result = FixResultSchema.parse({
    ...outcome,
    item: snapshot.item,
    trigger: attempt.trigger,
    attemptId: attempt.id,
    reason: outcome.reason === null ? null : redact(outcome.reason),
  });
  await fenceWork(tx, caller, id, snapshot, { activeAttemptId: null });
  await fenceAttempt(tx, caller, attempt, {
    state: 'failed',
    publication: Prisma.DbNull,
    baseSha: null,
    result,
    leaseUntil: null,
  });
  await recordResult(tx, caller, id, result);
  await audit.appendInTx(
    tx,
    caller.projectId,
    workAudit(caller, id, 'publication_aborted', {
      version: snapshot.version + 1,
      attemptId: attempt.id,
      state: 'failed',
    }),
  );
  return result;
}
