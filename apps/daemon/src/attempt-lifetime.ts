import { WorkError, type WorkCaller, type WorkRuntime } from '@graveshift/work';

export async function withAttemptLease<Value>(
  runtime: WorkRuntime,
  caller: WorkCaller,
  id: string,
  attemptId: string,
  work: (signal: AbortSignal) => Promise<Value>,
): Promise<Value> {
  const workerId = caller.workerId;
  if (workerId === undefined)
    throw new WorkError('WORKER_CHANGED', 'The Fix attempt has no worker');
  const controller = new AbortController();
  const lose = () =>
    controller.abort(new WorkError('LEASE_EXPIRED', 'The Fix attempt lease could not be renewed'));
  const renew = async () => {
    try {
      const ack = await runtime.heartbeat(caller, id, { attemptId, workerId });
      if (!ack.renewed) lose();
    } catch {
      lose();
    }
  };
  await renew();
  controller.signal.throwIfAborted();
  let pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (pending !== undefined || controller.signal.aborted) return;
    pending = renew().finally(() => {
      pending = undefined;
    });
  }, 10_000);
  try {
    return await work(controller.signal);
  } finally {
    clearInterval(timer);
    await pending;
  }
}
