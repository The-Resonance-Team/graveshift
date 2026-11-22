import type { Publisher } from '@graveshift/events';
import { type Clock, type Context } from '@graveshift/integrations';
import { createInMemoryPublisher, type InMemoryPublisher } from '@graveshift/events/testing';

export const fixedClock: Clock = {
  now: () => '2026-11-22T10:00:00.000Z',
  newId: () => 'trace-cycle-1',
};

export interface TestContext {
  context: Context;
  publisher: InMemoryPublisher;
}

export function makeContext(overrides: Partial<Context> = {}): TestContext {
  const publisher = createInMemoryPublisher();
  return {
    context: { publisher, projectId: 'project-1', service: 'api', ...overrides },
    publisher,
  };
}

/** A publisher that rejects the first n publish calls. */
export function rejectingPublisher(rejections: number): Publisher & { attempted: string[] } {
  const attempted: string[] = [];
  let remaining = rejections;
  return {
    attempted,
    async publish(envelope) {
      attempted.push(envelope.id);
      if (remaining > 0) {
        remaining -= 1;
        throw new Error('nats unavailable');
      }
    },
  };
}

/** Let queued timers and microtasks run. Watch loops and enrichment are async. */
export function flush(ticks = 5): Promise<void> {
  let chain = Promise.resolve();
  for (let i = 0; i < ticks; i += 1) chain = chain.then(() => new Promise((r) => setTimeout(r, 0)));
  return chain;
}

/** A sleep fake that records backoff delays and resolves only when the signal aborts. */
export function hangingSleep(): {
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  delays: number[];
} {
  const delays: number[] = [];
  return {
    delays,
    sleep: (ms, signal) => {
      delays.push(ms);
      return new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', () => resolve(), { once: true });
      });
    },
  };
}
