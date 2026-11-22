import type { EventEnvelope } from '@graveshift/core';
import { expect, test } from 'bun:test';

import { createDockerCollector } from './source';
import { BASE, clock, context, event, fakeDocker } from './test-helpers';

test('rejected publication retries the same prepared envelope before later observations', async () => {
  const fake = fakeDocker([[event('oom', 100), event('health_status: unhealthy', 101)]]);
  const attempts: EventEnvelope[] = [];
  const delays: number[] = [];
  const completed = Promise.withResolvers<void>();
  const collected = context();
  collected.value.publisher.publish = async (envelope) => {
    if (!envelope.type.startsWith('runtime.')) return;
    attempts.push(envelope);
    if (attempts.length <= 2) throw new Error('NATS outage');
    if (envelope.type === 'runtime.unhealthy') completed.resolve();
  };
  const collector = createDockerCollector({
    baseUrl: BASE,
    fetch: fake.fetchFn,
    clock,
    sleep: async (ms) => {
      delays.push(ms);
    },
  });
  collector.start(collected.value);
  try {
    await completed.promise;
    expect(attempts.map((envelope) => envelope.type)).toEqual([
      'runtime.oom',
      'runtime.oom',
      'runtime.oom',
      'runtime.unhealthy',
    ]);
    expect(attempts[1]).toBe(attempts[0]);
    expect(attempts[2]).toBe(attempts[0]);
    expect(delays.slice(0, 2)).toEqual([500, 1000]);
    expect(attempts[1]?.id).toBe('project-1:local:docker:c1:100000000000:oom');
  } finally {
    await collector.stop();
  }
});

test('stop during an outage leaves the delivery cursor before failed and queued observations', async () => {
  const fake = fakeDocker([
    [event('oom', 100), event('oom', 101), event('oom', 102)],
    [event('oom', 100), event('oom', 101), event('oom', 102)],
  ]);
  const waiting = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<void>();
  const attempts: EventEnvelope[] = [];
  let outage = true;
  const collected = context();
  collected.value.publisher.publish = async (envelope) => {
    if (!envelope.type.startsWith('runtime.')) return;
    attempts.push(envelope);
    if (outage && envelope.observedAt !== '1970-01-01T00:01:40.000Z') throw new Error('offline');
    if (!outage && envelope.observedAt === '1970-01-01T00:01:42.000Z') completed.resolve();
  };
  const collector = createDockerCollector({
    baseUrl: BASE,
    fetch: fake.fetchFn,
    clock,
    sleep: async (_ms, signal) => {
      if (!outage) return;
      waiting.resolve();
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', () => resolve(), { once: true });
      });
    },
  });
  collector.start(collected.value);
  await waiting.promise;
  await collector.stop();
  outage = false;
  collector.start(collected.value);
  try {
    expect(
      fake.requests
        .filter((url) => url.pathname === '/events')
        .at(-1)
        ?.searchParams.get('since'),
    ).toBe('100');
    await completed.promise;
    expect(attempts.map((envelope) => envelope.observedAt)).toEqual([
      '1970-01-01T00:01:40.000Z',
      '1970-01-01T00:01:41.000Z',
      '1970-01-01T00:01:41.000Z',
      '1970-01-01T00:01:42.000Z',
    ]);
    expect(attempts[1]?.id).toBe(attempts[2]?.id);
  } finally {
    await collector.stop();
  }
});
