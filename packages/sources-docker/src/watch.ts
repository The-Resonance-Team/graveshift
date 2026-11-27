import type { Signal } from '@graveshift/core';

/**
 * Watch-loop notices. Core used to export RuntimeEvent; it no longer does, so
 * the base Collector loop's shape is declared locally. The `signal` variant is
 * kept for callers that forward observations through the watch channel.
 */
export type RuntimeEvent =
  | { kind: 'signal'; cursor?: string; signal: Signal }
  | { kind: 'source_disconnected'; at: string; reason: string }
  | { kind: 'source_reconnected'; at: string; cursor?: string };

export const backoffMs = (attempt: number, base = 500, cap = 30_000): number =>
  Math.min(cap, base * 2 ** Math.min(attempt, 20));

export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

export const abortableSleep: Sleep = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

export interface WatchLoop {
  connect(signal: AbortSignal, connected: (cursor?: string) => void): Promise<void>;
  emit(event: RuntimeEvent): void;
  sleep?: Sleep;
  now?: () => Date;
}

// ponytail: duplicated in sources-k8s, upgrade by extracting into core if a third source lands
export function startWatchLoop({
  connect,
  emit,
  sleep = abortableSleep,
  now = () => new Date(),
}: WatchLoop): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  const safeEmit = (event: RuntimeEvent) => {
    try {
      emit(event);
    } catch {
      // a failing subscriber must not break the watch
    }
  };

  let everConnected = false;
  const cycle = async (attempt: number): Promise<void> => {
    let next = attempt;
    let reason = 'stream ended';
    try {
      await connect(signal, (cursor) => {
        next = 0;
        if (everConnected) {
          safeEmit({
            kind: 'source_reconnected',
            at: now().toISOString(),
            ...(cursor === undefined ? {} : { cursor }),
          });
        }
        everConnected = true;
      });
    } catch (error) {
      reason = error instanceof Error ? error.message : 'unknown error';
    }
    if (signal.aborted) return;
    safeEmit({ kind: 'source_disconnected', at: now().toISOString(), reason });
    await sleep(backoffMs(next), signal);
    if (!signal.aborted) void cycle(next + 1);
  };
  void cycle(0);

  return () => controller.abort();
}
