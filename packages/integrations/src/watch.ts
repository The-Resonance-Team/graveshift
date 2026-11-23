export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

export const backoffMs = (attempt: number, base = 500, cap = 30_000): number =>
  Math.min(cap, base * 2 ** Math.min(attempt, 20));

export const abortableSleep: Sleep = (ms, signal) =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });

export type WatchNotice =
  | { type: 'collector.disconnected'; reason: string }
  | { type: 'collector.reconnected'; cursor?: string };

interface WatchOptions {
  connect(signal: AbortSignal, connected: (cursor?: string) => void): Promise<void>;
  notice(event: WatchNotice): Promise<void>;
  sleep?: Sleep;
}

/** One producer owns acquisition, retries, abort and all connection notices. */
export function startWatchLoop({ connect, notice, sleep = abortableSleep }: WatchOptions) {
  const controller = new AbortController();
  const { signal } = controller;
  const pending = new Set<Promise<void>>();
  const emit = (event: WatchNotice) => {
    if (signal.aborted) return;
    const work = Promise.resolve()
      .then(() => {
        if (!signal.aborted) return notice(event);
      })
      .catch(() => {});
    pending.add(work);
    void work.then(() => pending.delete(work));
  };
  let everConnected = false;
  const run = async (attempt: number): Promise<void> => {
    if (!signal.aborted) {
      let reason = 'stream ended';
      try {
        await connect(signal, (cursor) => {
          if (signal.aborted) return;
          attempt = 0;
          if (everConnected) {
            emit({ type: 'collector.reconnected', ...(cursor === undefined ? {} : { cursor }) });
          }
          everConnected = true;
        });
      } catch (error) {
        reason = error instanceof Error ? error.message : 'unknown error';
      }
      if (!signal.aborted) {
        emit({ type: 'collector.disconnected', reason });
        try {
          await sleep(backoffMs(attempt++), signal);
        } catch {
          controller.abort();
        }
      }
    }
    if (!signal.aborted) return run(attempt);
  };
  const done = run(0).then(() => Promise.all(pending));
  return {
    async stop(): Promise<void> {
      controller.abort();
      await done;
    },
  };
}
