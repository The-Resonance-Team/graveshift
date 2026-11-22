import {
  WorkError,
  type Abandon,
  type AbortPublication,
  type Heartbeat,
  type WorkCaller,
} from '@graveshift/work';

import type { FlowRuntime } from './flow-runtime';

export async function flowHeartbeat(
  runtime: FlowRuntime,
  caller: WorkCaller,
  _id: string,
  input: Heartbeat,
) {
  const attempt = runtime.snapshot.activeAttempt;
  runtime.calls.push('heartbeat');
  return {
    renewed:
      !runtime.expired &&
      attempt?.id === input.attemptId &&
      attempt.workerId === input.workerId &&
      caller.workerId === input.workerId,
  };
}

export async function flowAbandon(
  runtime: FlowRuntime,
  caller: WorkCaller,
  id: string,
  input: Abandon,
) {
  const attempt = runtime.active(input);
  if (
    !runtime.expired ||
    attempt.publication !== null ||
    !['claimed', 'running'].includes(attempt.state)
  ) {
    throw new WorkError('COMMAND_IN_PROGRESS', 'The Fix attempt is still active');
  }
  return runtime.finish(caller, id, {
    ...input,
    state: 'failed',
    outcome: {
      effect: 'deny',
      ok: false,
      pr: null,
      reason: 'The Fix attempt was interrupted',
      failure: 'fix_error',
      routing: null,
    },
  });
}

export async function flowAbort(
  runtime: FlowRuntime,
  caller: WorkCaller,
  id: string,
  input: AbortPublication,
) {
  const attempt = runtime.active(input);
  if (
    attempt.state !== 'publishing' ||
    attempt.publication === null ||
    runtime.snapshot.item.draftPr !== null
  ) {
    throw new WorkError('INVALID_OUTCOME', 'Publication cannot be aborted');
  }
  runtime.snapshot.activeAttempt = { ...attempt, publication: null, baseSha: null };
  return runtime.finish(caller, id, { ...input, state: 'failed' });
}
