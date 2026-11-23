import { expect, test } from 'bun:test';

import { createDockerCollector } from './source';
import { BASE, clock, context, event, fakeDocker } from './test-helpers';

test('stop waits for watch acquisition and discards observations from a late response', async () => {
  const acquiring = Promise.withResolvers<void>();
  const response = Promise.withResolvers<Response>();
  let signal: AbortSignal | null | undefined;
  const fetchFn: typeof fetch = Object.assign(
    (_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal;
      acquiring.resolve();
      return response.promise;
    },
    { preconnect() {} },
  );
  const collector = createDockerCollector({ baseUrl: BASE, fetch: fetchFn, clock });
  const collected = context();
  collector.start(collected.value);
  await acquiring.promise;
  let stopped = false;
  const stopping = Promise.resolve(collector.stop()).then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(signal?.aborted).toBe(true);
  expect(stopped).toBe(false);
  response.resolve(new Response(JSON.stringify(event('oom', 1)) + '\n'));
  await stopping;
  expect(collected.envelopes).toHaveLength(0);
});

test('restart keeps native identity and one producer per Collector', async () => {
  const ready = Promise.withResolvers<void>();
  const fake = fakeDocker([[event('oom', 1)]]);
  const collected = context((envelope) => {
    if (envelope.type === 'runtime.oom') ready.resolve();
  });
  const collector = createDockerCollector({ baseUrl: BASE, fetch: fake.fetchFn, clock });
  collector.start(collected.value);
  await ready.promise;
  await collector.stop();
  const count = collected.envelopes.length;
  collector.start(collected.value);
  await collector.stop();
  expect(collected.envelopes).toHaveLength(count);
  const watches = fake.requests.filter((url) => url.pathname === '/events');
  expect(watches.at(-1)?.searchParams.get('since')).toBe('1');
});
