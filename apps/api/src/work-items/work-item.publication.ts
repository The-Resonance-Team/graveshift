import { NEEDS_HUMAN, PrRefSchema } from '@graveshift/core';
import { redact } from '@graveshift/redactor';
import {
  FixCompletionSchema,
  FixResultSchema,
  WorkError,
  type BeginPublication,
  type FinishAttempt,
  type FixResult,
  type RecordPublication,
  type WorkCaller,
  type WorkSnapshot,
} from '@graveshift/work';
import type { Prisma } from '@prisma/client';

import type { AuditSink } from '../audit/audit.sink';
import { assertWorker, publicationOwner, requireLiveLease } from './work-item.lease';
import { workAudit } from './work-item.mapper';
import { recordResult, requireCommand } from './work-item.receipts';
import { activeAttempt, fenceAttempt, fenceWork, loadWork } from './work-item.state';

export async function beginPublication(
  tx: Prisma.TransactionClient,
  audit: AuditSink,
  caller: WorkCaller,
  id: string,
  input: BeginPublication,
): Promise<WorkSnapshot> {
  const snapshot = await loadWork(tx, { projectId: caller.projectId, id });
  const attempt = activeAttempt(snapshot, input, ['claimed', 'running']);
  await requireCommand(tx, caller, id, attempt);
  const now = await requireLiveLease(tx, attempt, caller);
  if (attempt.publication !== null) {
    throw new WorkError('INVALID_OUTCOME', 'Publication must be reconciled before another write');
  }
  await fenceWork(tx, caller, id, snapshot, {});
  await fenceAttempt(
    tx,
    caller,
    attempt,
    {
      state: 'publishing',
      publication: input.intent,
      baseSha: input.intent.baseSha,
    },
    { leaseUntil: { gt: now } },
  );
  await audit.appendInTx(
    tx,
    caller.projectId,
    workAudit(caller, id, 'publication_started', {
      version: snapshot.version + 1,
      attemptId: attempt.id,
      state: 'publishing',
    }),
  );
  return loadWork(tx, { projectId: caller.projectId, id });
}

export async function recordPublication(
  tx: Prisma.TransactionClient,
  caller: WorkCaller,
  id: string,
  input: RecordPublication,
): Promise<WorkSnapshot> {
  const snapshot = await loadWork(tx, { projectId: caller.projectId, id });
  const attempt = activeAttempt(snapshot, input, ['publishing', 'uncertain']);
  await requireCommand(tx, caller, id, attempt);
  const ownership = await publicationOwner(tx, attempt, caller);
  const intent = attempt.publication;
  if (
    intent === null ||
    intent.repo !== input.pr.repo ||
    intent.branch !== input.pr.branch ||
    attempt.baseSha !== input.baseSha
  ) {
    throw new WorkError('INVALID_OUTCOME', 'The Exorcism must match the saved publication intent');
  }
  const known = PrRefSchema.safeParse(intent);
  if (known.success && JSON.stringify(known.data) !== JSON.stringify(input.pr)) {
    throw new WorkError('INVALID_OUTCOME', 'A known Exorcism cannot be replaced');
  }
  await fenceWork(tx, caller, id, snapshot, {
    draftPr: input.pr,
  });
  await fenceAttempt(tx, caller, attempt, {
    state: 'publishing',
    publication: input.pr,
    ...ownership,
  });
  return loadWork(tx, { projectId: caller.projectId, id });
}

export async function finishAttempt(
  tx: Prisma.TransactionClient,
  audit: AuditSink,
  caller: WorkCaller,
  id: string,
  input: FinishAttempt,
): Promise<FixResult> {
  const snapshot = await loadWork(tx, { projectId: caller.projectId, id });
  const attempt = activeAttempt(snapshot, input, ['claimed', 'running', 'publishing', 'uncertain']);
  await requireCommand(tx, caller, id, attempt);
  assertWorker(attempt, caller);
  const running = attempt.state === 'claimed' || attempt.state === 'running';
  const now = running ? await requireLiveLease(tx, attempt, caller) : undefined;
  const outcome = FixCompletionSchema.parse(input.outcome);
  const known = PrRefSchema.safeParse(attempt.publication);
  if (
    (input.state === 'completed') !== outcome.ok ||
    (input.state === 'needs_human' && outcome.failure !== 'needs_human') ||
    (input.state === 'uncertain' && outcome.failure !== 'publication_uncertain')
  ) {
    throw new WorkError('INVALID_OUTCOME', 'The attempt state and outcome must agree');
  }
  if (
    outcome.pr !== null &&
    (!known.success || JSON.stringify(outcome.pr) !== JSON.stringify(known.data))
  ) {
    throw new WorkError('INVALID_OUTCOME', 'Record the known Exorcism before completion');
  }
  if (attempt.publication !== null && !known.success && input.state !== 'uncertain') {
    throw new WorkError('INVALID_OUTCOME', 'Reconcile the uncertain publication before completion');
  }
  if (input.state === 'uncertain' && attempt.publication === null) {
    throw new WorkError('INVALID_OUTCOME', 'An uncertain publication requires a saved intent');
  }
  const manual = input.state === 'needs_human';
  const item = manual ? { ...snapshot.item, assignee: NEEDS_HUMAN } : snapshot.item;
  const result = FixResultSchema.parse({
    ...outcome,
    item,
    trigger: attempt.trigger,
    attemptId: attempt.id,
    pr: known.success ? known.data : outcome.pr,
    reason: outcome.reason === null ? null : redact(outcome.reason),
    routing:
      outcome.routing === null
        ? null
        : {
            ...outcome.routing,
            ...(outcome.routing.kind === 'ask'
              ? { question: redact(outcome.routing.question) }
              : {}),
            ...(outcome.routing.kind === 'needs_human'
              ? { reason: redact(outcome.routing.reason) }
              : {}),
          },
  });
  await fenceWork(tx, caller, id, snapshot, {
    ...(manual ? { assignee: NEEDS_HUMAN } : {}),
    ...(input.state === 'uncertain' ? {} : { activeAttemptId: null }),
  });
  await fenceAttempt(
    tx,
    caller,
    attempt,
    { state: input.state, result, leaseUntil: null },
    now === undefined ? {} : { leaseUntil: { gt: now } },
  );
  await recordResult(tx, caller, id, result);
  await audit.appendInTx(
    tx,
    caller.projectId,
    workAudit(caller, id, 'finished', {
      version: snapshot.version + 1,
      attemptId: attempt.id,
      state: input.state,
    }),
  );
  return result;
}
