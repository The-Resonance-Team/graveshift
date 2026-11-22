import { declaredParams, paramDefaults } from '@graveshift/agents';
import { WorkError, type ApplyAnswer, type ClaimResult, type WorkCaller } from '@graveshift/work';

import type { FlowRuntime } from './flow-runtime';

export async function applyFlowAnswer(
  runtime: FlowRuntime,
  caller: WorkCaller,
  id: string,
  input: ApplyAnswer,
): Promise<ClaimResult> {
  const attempt = runtime.active({ ...input, attemptId: input.body.attemptId });
  if (attempt.state !== 'awaiting_answer' || attempt.questionId !== input.body.questionId) {
    throw new WorkError('QUESTION_NOT_PENDING', 'Question is not pending');
  }
  const agent = runtime.agents.find((entry) => entry.name === attempt.agent);
  if (agent === undefined) throw new Error('Missing Agent');
  const params = { ...paramDefaults(agent), ...attempt.params, ...input.body.params };
  runtime.receipts.set(caller.commandId, {
    request: { kind: 'answer', body: input.body },
    outcome: null,
    caller,
    workVersion: runtime.snapshot.version + 1,
    attemptId: attempt.id,
  });
  const missing = declaredParams(agent).filter((name) => !params[name]?.trim());
  if (missing.length > 0) {
    runtime.snapshot.item = {
      ...runtime.snapshot.item,
      assignee: 'needs_human',
    };
    return {
      kind: 'replay',
      outcome: {
        kind: 'fix',
        result: await runtime.finish(caller, id, {
          expectedVersion: runtime.snapshot.version,
          attemptId: attempt.id,
          attemptVersion: attempt.version,
          state: 'needs_human',
          outcome: {
            effect: 'deny',
            ok: false,
            pr: null,
            failure: 'needs_human',
            reason: 'missing params',
            routing: {
              kind: 'needs_human',
              agent: attempt.agent,
              reason: 'missing params',
              missing,
            },
          },
        }),
      },
    };
  }
  runtime.expired = false;
  runtime.update({
    ...attempt,
    state: 'running',
    params,
    workerId: caller.workerId ?? null,
    leaseUntil: caller.workerId === undefined ? null : '2099-01-01T00:00:00.000Z',
  });
  return runtime.claimed();
}
