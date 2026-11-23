import type { EventEnvelope } from '@graveshift/core';
import type { Publisher } from '@graveshift/events';

import { abortableSleep, backoffMs, type Sleep } from './watch';

const MAX_PENDING = 256;
const STOP_FLUSH_MS = 1000;

interface Delivery {
  key: string;
  deliver(send: (envelope: EventEnvelope) => Promise<void>, signal: AbortSignal): Promise<void>;
  acknowledge(): void;
}

function interrupt<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function* attempts(signal: AbortSignal) {
  let attempt = 0;
  while (!signal.aborted) yield attempt++;
}

/** One ordered infrastructure delivery queue, bounded to 256 native observations. */
export function createDeliveryQueue(publisher: Publisher, sleep: Sleep = abortableSleep) {
  const controller = new AbortController();
  const { signal } = controller;
  const pending: Delivery[] = [];
  const keys = new Set<string>();
  let changed = Promise.withResolvers<void>();
  let worker: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  let closed = false;
  const notify = () => {
    changed.resolve();
    changed = Promise.withResolvers<void>();
  };
  const retry = async (work: () => Promise<void>) => {
    for await (const attempt of attempts(signal)) {
      try {
        await interrupt(
          Promise.resolve().then(() => {
            signal.throwIfAborted();
            return work();
          }),
          signal,
        );
        signal.throwIfAborted();
        return;
      } catch {
        signal.throwIfAborted();
        await interrupt(sleep(backoffMs(attempt), signal), signal);
      }
    }
    signal.throwIfAborted();
  };
  const send = (envelope: EventEnvelope) => retry(() => publisher.publish(envelope));
  async function* entries() {
    while (pending.length && !signal.aborted) yield pending[0]!;
  }
  const start = () => {
    worker = (async () => {
      for await (const entry of entries()) {
        await retry(() => entry.deliver(send, signal));
        if (signal.aborted) break;
        entry.acknowledge();
        pending.shift();
        keys.delete(entry.key);
        notify();
      }
    })()
      .catch(() => controller.abort())
      .finally(() => {
        worker = undefined;
        notify();
        if (pending.length && !signal.aborted) start();
      });
  };
  const drain = (): Promise<void> => (worker ? worker.then(drain) : Promise.resolve());
  const ready = async (reader: AbortSignal): Promise<boolean> => {
    if (closed || reader.aborted || signal.aborted) return false;
    if (pending.length < MAX_PENDING) return true;
    try {
      await interrupt(changed.promise, reader);
      return ready(reader);
    } catch {
      return false;
    }
  };

  return {
    has: (key: string) => keys.has(key),
    enqueue(entry: Delivery): boolean {
      if (closed || signal.aborted || pending.length >= MAX_PENDING) return false;
      keys.add(entry.key);
      pending.push(entry);
      if (!worker) start();
      return true;
    },
    ready,
    drain,
    /** Connection notices are best effort and never commit an observation cursor. */
    async notice(envelope: EventEnvelope) {
      try {
        signal.throwIfAborted();
        await interrupt(
          Promise.resolve().then(() => publisher.publish(envelope)),
          signal,
        );
      } catch {
        // Connection telemetry cannot block source recovery or shutdown.
      }
    },
    /** Flush for at most one second; cancelled work never runs its acknowledgement. */
    stop(): Promise<void> {
      if (stopping) return stopping;
      closed = true;
      notify();
      const timer = setTimeout(() => controller.abort(), STOP_FLUSH_MS);
      stopping = drain().finally(() => {
        clearTimeout(timer);
        controller.abort();
        pending.length = 0;
        keys.clear();
        notify();
      });
      return stopping;
    },
  };
}
