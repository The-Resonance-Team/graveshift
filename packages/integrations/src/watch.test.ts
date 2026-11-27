import { expect, test } from 'bun:test';
import fc from 'fast-check';

import { abortableSleep, backoffMs, startWatchLoop } from './watch';

test('backoff is monotone and capped', () => {
  fc.assert(
    fc.property(fc.nat(100), (attempt) => {
      expect(backoffMs(attempt)).toBeLessThanOrEqual(30_000);
      expect(backoffMs(attempt + 1)).toBeGreaterThanOrEqual(backoffMs(attempt));
    }),
  );
});

test('abortable sleep handles an already aborted lifetime and cancels a pending timer', async () => {
  const controller = new AbortController();
  const sleeping = abortableSleep(60_000, controller.signal);
  controller.abort();
  await sleeping;
  await abortableSleep(60_000, controller.signal);
  expect(controller.signal.aborted).toBe(true);
});

test('failed notices cannot end the producer and stop owns pending notices', async () => {
  const second = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const delivery = Promise.withResolvers<void>();
  let calls = 0;
  const lifetime = startWatchLoop({
    async connect(signal, connected) {
      calls += 1;
      connected('cursor');
      if (calls === 1) throw new Error('offline');
      second.resolve();
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', () => resolve(), { once: true });
      });
    },
    async notice(event) {
      if (event.type === 'collector.disconnected') throw new Error('subscriber failed');
      delivery.resolve();
      await release.promise;
    },
    sleep: async () => {},
  });
  await second.promise;
  await delivery.promise;
  let stopped = false;
  const stopping = lifetime.stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);
  release.resolve();
  await stopping;
  expect(calls).toBe(2);
});
