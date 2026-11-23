import { expect, test } from 'bun:test';

import { createK8sCollector } from './source';
import { clock, context, fakeApi, fixture } from './test-helpers';
import { WatchExpiredError } from './types';

test('an unfinished OOM read cannot commit the native cursor or publish after cancellation', async () => {
  const first = fixture();
  const last = fixture({ uid: 'uid-2', resourceVersion: '102', reason: 'Unhealthy' });
  const fake = fakeApi([
    [first, last],
    [first, last],
  ]);
  const lookup = Promise.withResolvers<boolean>();
  const entered = Promise.withResolvers<void>();
  const watched = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<void>();
  let reads = 0;
  const watch = fake.api.watchEvents;
  fake.api.watchEvents = (...args) => {
    if (fake.versions.length) watched.resolve();
    return watch(...args);
  };
  fake.api.podOomKilled = () => {
    if (reads++ === 0) {
      entered.resolve();
      return lookup.promise;
    }
    return Promise.resolve(true);
  };
  const collected = context((envelope) => {
    if (envelope.type === 'runtime.unhealthy') completed.resolve();
  });
  const collector = createK8sCollector({ api: fake.api, clock });
  collector.start(collected.value);
  await entered.promise;
  await collector.stop();
  expect(collected.envelopes.map((envelope) => envelope.type)).toEqual(['runtime.crash_loop']);
  lookup.resolve(true);
  collector.start(collected.value);
  try {
    await watched.promise;
    expect(fake.versions).toEqual(['100', '100']);
    await completed.promise;
    expect(
      collected.envelopes
        .filter((envelope) => envelope.type.startsWith('runtime.'))
        .map((envelope) => envelope.type),
    ).toEqual(['runtime.crash_loop', 'runtime.crash_loop', 'runtime.oom', 'runtime.unhealthy']);
    expect(collected.envelopes[0]?.id).toBe(collected.envelopes[1]?.id);
  } finally {
    lookup.resolve(true);
    await collector.stop();
  }
}, 3000);

test('410 during failed retained delivery cannot reset the cursor before stop and replay', async () => {
  const event = fixture({ reason: 'Unhealthy' });
  const fake = fakeApi([[event]]);
  const waiting = Promise.withResolvers<void>();
  const watched = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<void>();
  let outage = true;
  let versions = 0;
  fake.api.latestEventVersion = async () => String(100 + 400 * versions++);
  const watch = fake.api.watchEvents;
  fake.api.watchEvents = async (version, onEvent, signal, onOpen) => {
    if (!outage) {
      watched.resolve();
      return watch(version, onEvent, signal, onOpen);
    }
    fake.versions.push(version);
    onOpen();
    onEvent(event);
    throw new WatchExpiredError();
  };
  const collected = context();
  collected.value.publisher.publish = async (envelope) => {
    if (!envelope.type.startsWith('runtime.')) return;
    if (outage) throw new Error('NATS outage');
    completed.resolve();
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
    await watched.promise;
    expect(fake.versions).toEqual(['100', '100']);
    expect(versions).toBe(1);
    await completed.promise;
  } finally {
    await collector.stop();
  }
}, 3000);

test('a hung publication is cancelled without consumed seen state or another Collector cursor', async () => {
  const first = fixture({ reason: 'Unhealthy' });
  const fake = fakeApi([[first], [first]]);
  const otherFake = fakeApi([
    [fixture({ uid: 'other', resourceVersion: '900', reason: 'Unhealthy' })],
  ]);
  const entered = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<void>();
  const recovered = Promise.withResolvers<void>();
  const otherReady = Promise.withResolvers<void>();
  const watched = Promise.withResolvers<void>();
  const attempts: string[] = [];
  let restarting = false;
  const watch = fake.api.watchEvents;
  fake.api.watchEvents = (...args) => {
    if (restarting) watched.resolve();
    return watch(...args);
  };
  const collected = context();
  collected.value.publisher.publish = async (envelope) => {
    if (!envelope.type.startsWith('runtime.')) return;
    attempts.push(envelope.id);
    if (!restarting) {
      entered.resolve();
      return pending.promise;
    }
    recovered.resolve();
  };
  const otherContext = context((envelope) => {
    if (envelope.type === 'runtime.unhealthy') otherReady.resolve();
  });
  const collector = createK8sCollector({ api: fake.api, clock });
  const other = createK8sCollector({ api: otherFake.api, clock });
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
    await watched.promise;
    expect(fake.versions).toEqual(['100', '100']);
    expect(otherFake.versions).toEqual(['100']);
    await recovered.promise;
    expect(attempts).toEqual([
      'project-1:cluster:k8s:uid-1:101',
      'project-1:cluster:k8s:uid-1:101',
    ]);
  } finally {
    pending.resolve();
    await collector.stop();
    await other.stop();
  }
}, 3000);
