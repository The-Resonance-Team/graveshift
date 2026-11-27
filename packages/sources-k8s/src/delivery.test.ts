import type { EventEnvelope } from '@graveshift/core';
import { expect, test } from 'bun:test';

import { createK8sCollector } from './source';
import { clock, context, fakeApi, fixture } from './test-helpers';

test('rejected publication retries the same envelope before OOM enrichment and later observations', async () => {
  const fake = fakeApi([
    [fixture(), fixture({ uid: 'uid-2', resourceVersion: '102', reason: 'Unhealthy' })],
  ]);
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
  const collector = createK8sCollector({
    api: fake.api,
    clock,
    sleep: async (ms) => {
      delays.push(ms);
    },
  });
  collector.start(collected.value);
  try {
    await completed.promise;
    expect(attempts.map((envelope) => envelope.type)).toEqual([
      'runtime.crash_loop',
      'runtime.crash_loop',
      'runtime.crash_loop',
      'runtime.oom',
      'runtime.unhealthy',
    ]);
    expect(attempts[1]).toBe(attempts[0]);
    expect(attempts[2]).toBe(attempts[0]);
    expect(delays.slice(0, 2)).toEqual([500, 1000]);
    expect(attempts[1]?.id).toBe('project-1:cluster:k8s:uid-1:101');
  } finally {
    await collector.stop();
  }
});

test('stop during an outage keeps unacknowledged native events outside consumed seen state', async () => {
  const first = fixture({ reason: 'Unhealthy' });
  const second = fixture({ uid: 'uid-2', resourceVersion: '102', reason: 'Unhealthy' });
  const fake = fakeApi([
    [first, second],
    [first, second],
  ]);
  const waiting = Promise.withResolvers<void>();
  const restarted = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<void>();
  const attempts: EventEnvelope[] = [];
  let outage = true;
  const original = fake.api.watchEvents;
  fake.api.watchEvents = (...args) => {
    if (!outage) restarted.resolve();
    return original(...args);
  };
  const collected = context();
  collected.value.publisher.publish = async (envelope) => {
    if (!envelope.type.startsWith('runtime.')) return;
    attempts.push(envelope);
    if (outage) throw new Error('offline');
    if (envelope.id.endsWith(':102')) completed.resolve();
  };
  const collector = createK8sCollector({
    api: fake.api,
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
    await restarted.promise;
    expect(fake.versions).toEqual(['100', '100']);
    await completed.promise;
    expect(attempts.map((envelope) => envelope.id)).toEqual([
      'project-1:cluster:k8s:uid-1:101',
      'project-1:cluster:k8s:uid-1:101',
      'project-1:cluster:k8s:uid-2:102',
    ]);
  } finally {
    await collector.stop();
  }
});
