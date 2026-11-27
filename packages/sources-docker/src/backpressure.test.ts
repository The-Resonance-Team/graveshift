import { expect, test } from 'bun:test';

import { createDockerCollector } from './source';
import { BASE, clock, context, event } from './test-helpers';

test('a full delivery queue pauses Docker reads and keeps later observations ordered', async () => {
  const blocked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const filled = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<void>();
  let pulls = 0;
  let attempts = 0;
  const acknowledged: string[] = [];
  const events = Array.from({ length: 300 }, (_, index) => event('oom', 100 + index));
  const fetchFn: typeof fetch = Object.assign(
    async (_input: string | URL | Request, init?: RequestInit) => {
      return new Response(
        new ReadableStream(
          {
            pull(controller) {
              if (init?.signal?.aborted || pulls === events.length) {
                controller.close();
                return;
              }
              const next = events[pulls++]!;
              controller.enqueue(new TextEncoder().encode(JSON.stringify(next) + '\n'));
              if (pulls === 257) filled.resolve();
            },
          },
          { highWaterMark: 0 },
        ),
      );
    },
    { preconnect() {} },
  );
  const collected = context();
  collected.value.publisher.publish = async (envelope) => {
    if (!envelope.type.startsWith('runtime.')) return;
    if (attempts++ === 0) throw new Error('NATS outage');
    acknowledged.push(envelope.id);
    if (acknowledged.length === events.length) completed.resolve();
  };
  const collector = createDockerCollector({
    baseUrl: BASE,
    fetch: fetchFn,
    clock,
    sleep: async (_ms, signal) => {
      blocked.resolve();
      if (!signal.aborted) await release.promise;
    },
  });
  collector.start(collected.value);
  try {
    await blocked.promise;
    await filled.promise;
    expect(pulls).toBe(257);
    expect(acknowledged).toHaveLength(0);
    release.resolve();
    await completed.promise;
    expect(acknowledged).toEqual(
      events.map((native) => `project-1:local:docker:c1:${native.timeNano}:oom`),
    );
    expect(attempts).toBe(301);
  } finally {
    release.resolve();
    await collector.stop();
  }
});
