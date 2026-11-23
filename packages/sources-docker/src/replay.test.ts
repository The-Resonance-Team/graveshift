import type { EventEnvelope } from '@graveshift/core';
import { expect, test } from 'bun:test';

import { createDockerCollector } from './source';
import { BASE, clock, context, event, fakeDocker } from './test-helpers';

test('stop cancels a hung ACK without committing it and another Collector cannot change its replay floor', async () => {
  const fake = fakeDocker([[event('oom', 100)], [event('oom', 100), event('oom', 101)]]);
  const otherFake = fakeDocker([[event('oom', 900)]]);
  const entered = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<void>();
  const resumed = Promise.withResolvers<void>();
  const otherReady = Promise.withResolvers<void>();
  const attempts: EventEnvelope[] = [];
  let restarting = false;
  const collected = context();
  collected.value.publisher.publish = async (envelope) => {
    if (!envelope.type.startsWith('runtime.')) return;
    attempts.push(envelope);
    if (!restarting) {
      entered.resolve();
      return pending.promise;
    }
    if (envelope.observedAt === '1970-01-01T00:01:41.000Z') resumed.resolve();
  };
  const otherContext = context((envelope) => {
    if (envelope.type === 'runtime.oom') otherReady.resolve();
  });
  const collector = createDockerCollector({ baseUrl: BASE, fetch: fake.fetchFn, clock });
  const other = createDockerCollector({ baseUrl: BASE, fetch: otherFake.fetchFn, clock });
  collector.start(collected.value);
  other.start(otherContext.value);
  await entered.promise;
  await otherReady.promise;
  await other.stop();
  await collector.stop();
  pending.resolve();
  restarting = true;
  collector.start(collected.value);
  try {
    expect(
      fake.requests
        .filter((url) => url.pathname === '/events')
        .at(-1)
        ?.searchParams.get('since'),
    ).toBe('100');
    expect(otherFake.requests.filter((url) => url.pathname === '/events')).toHaveLength(1);
    await resumed.promise;
    expect(attempts.map((envelope) => envelope.id)).toEqual([
      'project-1:local:docker:c1:100000000000:oom',
      'project-1:local:docker:c1:100000000000:oom',
      'project-1:local:docker:c1:101000000000:oom',
    ]);
  } finally {
    pending.resolve();
    await collector.stop();
    await other.stop();
  }
}, 3000);

test('an unacknowledged event in the same Docker second stays outside seenAtCursor', async () => {
  const first = event('oom', 100);
  const second = event('health_status: unhealthy', 100);
  const fake = fakeDocker([
    [first, second],
    [first, second],
  ]);
  const paused = Promise.withResolvers<void>();
  const recovered = Promise.withResolvers<void>();
  const attempts: string[] = [];
  let outage = true;
  const collected = context();
  collected.value.publisher.publish = async (envelope) => {
    if (!envelope.type.startsWith('runtime.')) return;
    attempts.push(envelope.id);
    if (envelope.type === 'runtime.unhealthy') {
      if (outage) throw new Error('NATS down');
      recovered.resolve();
    }
  };
  const collector = createDockerCollector({
    baseUrl: BASE,
    fetch: fake.fetchFn,
    clock,
    sleep: async (_ms, signal) => {
      if (!outage) return;
      paused.resolve();
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', () => resolve(), { once: true });
      });
    },
  });
  collector.start(collected.value);
  await paused.promise;
  await collector.stop();
  outage = false;
  collector.start(collected.value);
  try {
    await recovered.promise;
    expect(attempts).toEqual([
      'project-1:local:docker:c1:100000000000:oom',
      'project-1:local:docker:c1:100000000000:unhealthy',
      'project-1:local:docker:c1:100000000000:unhealthy',
    ]);
  } finally {
    await collector.stop();
  }
}, 3000);
