import { declaredParams, paramDefaults } from '@graveshift/agents';
import { NEEDS_HUMAN } from '@graveshift/core';
import {
  WorkError,
  type ApplyAnswer,
  type ClaimResult,
  type FixResult,
  type SaveQuestion,
  type WorkCaller,
} from '@graveshift/work';
import { Prisma } from '@prisma/client';

import type { AuditSink } from '../audit/audit.sink';
import { newLease, requireLiveLease } from './work-item.lease';
import { safeParams, safeProgress, workAudit } from './work-item.mapper';
import type { WorkAgents } from './work-item.policy';
import { recordResult, requireCommand } from './work-item.receipts';
import {
  activeAttempt,
  commandReceipt,
  createReceipt,
  fenceAttempt,
  fenceWork,
  loadWork,
  recordedOutcome,
} from './work-item.state';

export async function saveQuestion(
  tx: Prisma.TransactionClient,
  audit: AuditSink,
  agents: WorkAgents,
  caller: WorkCaller,
  id: string,
  input: SaveQuestion,
): Promise<FixResult> {
  const snapshot = await loadWork(tx, { projectId: caller.projectId, id });
  const attempt = activeAttempt(snapshot, input, ['claimed']);
  await requireCommand(tx, caller, id, attempt);
  const now = await requireLiveLease(tx, attempt, caller);
  if (attempt.questionId !== null)
    throw new WorkError('QUESTION_ALREADY_ASKED', 'One question was already saved');
  const progress = safeProgress(input.progress);
  const agent = agents.find((entry) => entry.name === attempt.agent);
  if (
    !agent ||
    progress.attemptId !== attempt.id ||
    progress.selectedAgent.name !== agent.name ||
    progress.selectedAgent.slug !== agent.slug
  ) {
    throw new WorkError('INVALID_PROGRESS', 'Routing must keep the assigned Agent and Fix attempt');
  }
  const names = declaredParams(agent);
  const missing = names.filter(
    (name) => !(progress.params[name] ?? paramDefaults(agent)[name])?.trim(),
  );
  if (
    Object.keys(progress.params).some((name) => !names.includes(name)) ||
    missing.length !== progress.missing.length ||
    missing.some((name) => !progress.missing.includes(name))
  ) {
    throw new WorkError('INVALID_PROGRESS', 'The question must use the assigned Agent params');
  }
  const questionId = `${attempt.id}:question`;
  await fenceWork(tx, caller, id, snapshot, {});
  const result: FixResult = {
    item: snapshot.item,
    trigger: attempt.trigger,
    effect: 'deny',
    ok: false,
    pr: null,
    reason: 'awaiting_answer',
    failure: 'awaiting_answer',
    routing: {
      kind: 'ask',
      agent: progress.selectedAgent,
      questionId,
      question: progress.question,
      missing: progress.missing,
    },
    attemptId: attempt.id,
  };
  await fenceAttempt(
    tx,
    caller,
    attempt,
    {
      state: 'awaiting_answer',
      routingProgress: progress,
      params: progress.params,
      questionId,
      result,
      workerId: null,
      leaseUntil: null,
    },
    { leaseUntil: { gt: now } },
  );
  await recordResult(tx, caller, id, result);
  await audit.appendInTx(
    tx,
    caller.projectId,
    workAudit(caller, id, 'question_saved', {
      version: snapshot.version + 1,
      attemptId: attempt.id,
      state: 'awaiting_answer',
    }),
  );
  return result;
}

export async function applyAnswer(
  tx: Prisma.TransactionClient,
  audit: AuditSink,
  agents: WorkAgents,
  caller: WorkCaller,
  id: string,
  input: ApplyAnswer,
): Promise<ClaimResult> {
  const request = { kind: 'answer' as const, body: input.body };
  const receipt = await commandReceipt(tx, caller, id, request);
  if (receipt !== null) {
    const outcome = recordedOutcome(receipt);
    if (outcome !== null) return { kind: 'replay', outcome };
    throw new WorkError('COMMAND_IN_PROGRESS', 'This answer is already being processed');
  }
  const snapshot = await loadWork(tx, { projectId: caller.projectId, id });
  const attempt = activeAttempt(snapshot, { ...input, attemptId: input.body.attemptId }, [
    'awaiting_answer',
  ]);
  const progress = attempt.routingProgress;
  if (progress === null || attempt.questionId !== input.body.questionId) {
    throw new WorkError('QUESTION_NOT_PENDING', 'This question is not awaiting an answer');
  }
  const agent = agents.find(
    (entry) => entry.name === attempt.agent && entry.slug === progress.selectedAgent.slug,
  );
  const names =
    agent === undefined
      ? [...new Set([...Object.keys(progress.params), ...progress.missing])]
      : declaredParams(agent);
  if (Object.keys(input.body.params).some((name) => !names.includes(name))) {
    throw new WorkError('INVALID_PROGRESS', 'The answer contains an undeclared Agent param');
  }
  const supplied = safeParams({ ...progress.params, ...input.body.params });
  const params = agent === undefined ? supplied : { ...paramDefaults(agent), ...supplied };
  const missing = names.filter((name) => !params[name]?.trim());
  const complete = agent !== undefined && missing.length === 0;
  const reason = agent === undefined ? 'selected_agent_unavailable' : 'missing_params_after_answer';
  await fenceWork(
    tx,
    caller,
    id,
    snapshot,
    complete
      ? {}
      : {
          assignee: NEEDS_HUMAN,
          activeAttemptId: null,
        },
  );
  const result: FixResult = {
    item: { ...snapshot.item, assignee: NEEDS_HUMAN },
    trigger: attempt.trigger,
    effect: 'deny',
    ok: false,
    pr: null,
    reason,
    failure: 'needs_human',
    routing: {
      kind: 'needs_human',
      agent: attempt.agent,
      reason,
      missing,
    },
    attemptId: attempt.id,
  };
  await fenceAttempt(tx, caller, attempt, {
    state: complete ? 'running' : 'needs_human',
    params,
    result: complete ? Prisma.DbNull : result,
    ...(complete ? await newLease(tx, caller) : { workerId: null, leaseUntil: null }),
  });
  await createReceipt(tx, caller, id, request, snapshot.version + 1, attempt.id);
  if (!complete) await recordResult(tx, caller, id, result);
  await audit.appendInTx(
    tx,
    caller.projectId,
    workAudit(caller, id, 'answer_applied', {
      version: snapshot.version + 1,
      attemptId: attempt.id,
      state: complete ? 'running' : 'needs_human',
    }),
  );
  if (!complete) return { kind: 'replay', outcome: { kind: 'fix', result } };
  const next = await loadWork(tx, { projectId: caller.projectId, id });
  if (!next.activeAttempt)
    throw new WorkError('ATTEMPT_NOT_FOUND', 'The Fix attempt does not exist');
  return { kind: 'claimed', snapshot: next, attempt: next.activeAttempt };
}
