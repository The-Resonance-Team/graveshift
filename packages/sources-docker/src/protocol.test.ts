import { expect, test } from 'bun:test';

import { createDockerCollector } from './source';
import { BASE, clock, context, event, fakeDocker } from './test-helpers';

test('malformed and split Docker frames do not stop later observations', async () => {
  const encoded = new TextEncoder().encode(
    '{not-json}\n{}\n' + JSON.stringify(event('oom', 1)) + '\n',
  );
  const observed = Promise.withResolvers<void>();
  const fetchFn: typeof fetch = Object.assign(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoded.slice(0, 16));
            controller.enqueue(encoded.slice(16, 40));
            controller.enqueue(encoded.slice(40));
            controller.close();
          },
        }),
      ),
    { preconnect() {} },
  );
  const collected = context((envelope) => {
    if (envelope.type === 'runtime.oom') observed.resolve();
  });
  const collector = createDockerCollector({ baseUrl: BASE, fetch: fetchFn, clock });
  collector.start(collected.value);
  await observed.promise;
  await collector.stop();
  expect(collected.envelopes.filter((envelope) => envelope.type === 'runtime.oom')).toHaveLength(1);
});

test('stop flushes pending delivery and retained later observations', async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const fake = fakeDocker([[event('oom', 1), event('oom', 2)]]);
  const collected = context();
  collected.value.publisher.publish = async (envelope) => {
    collected.envelopes.push(envelope);
    entered.resolve();
    await release.promise;
  };
  const collector = createDockerCollector({ baseUrl: BASE, fetch: fake.fetchFn, clock });
  collector.start(collected.value);
  await entered.promise;
  let stopped = false;
  const stopping = Promise.resolve(collector.stop()).then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);
  release.resolve();
  await stopping;
  expect(collected.envelopes.map((envelope) => envelope.type)).toEqual([
    'runtime.oom',
    'runtime.oom',
  ]);
});

test('native container identity keeps the same Grave when later frames omit labels', async () => {
  const second = event('oom', 2);
  second.Actor.Attributes = {};
  const fake = fakeDocker([[event('oom', 1), second]]);
  const observed = Promise.withResolvers<void>();
  const collected = context((envelope) => {
    if (envelope.observedAt === '1970-01-01T00:00:02.000Z') observed.resolve();
  });
  const collector = createDockerCollector({ baseUrl: BASE, fetch: fake.fetchFn, clock });
  collector.start(collected.value);
  await observed.promise;
  await collector.stop();
  expect(collected.envelopes.map((envelope) => envelope.service)).toEqual(['api', 'api']);
});
