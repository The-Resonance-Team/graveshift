import { expect, test } from 'bun:test';

import { createK8sCollector } from './source';
import { clock, context, fakeApi, fixture } from './test-helpers';

test('a full push queue closes the watch and replays unretained frames after acknowledged delivery', async () => {
  const events = Array.from({ length: 300 }, (_, index) =>
    fixture({ uid: `uid-${index}`, resourceVersion: String(101 + index), reason: 'Unhealthy' }),
  );
  const fake = fakeApi([events, events]);
  const blocked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<void>();
  const acknowledged: string[] = [];
  let failed = false;
  const collected = context();
  collected.value.publisher.publish = async (envelope) => {
    if (!envelope.type.startsWith('runtime.')) return;
    if (!failed) {
      failed = true;
      throw new Error('NATS outage');
    }
    acknowledged.push(envelope.id);
    if (acknowledged.length === events.length) completed.resolve();
  };
  let sleeps = 0;
  const collector = createK8sCollector({
    api: fake.api,
    clock,
    sleep: async () => {
      if (sleeps++ === 0) {
        blocked.resolve();
        await release.promise;
      }
    },
  });
  collector.start(collected.value);
  try {
    await blocked.promise;
    expect(fake.signals[0]?.aborted).toBe(true);
    expect(fake.versions).toEqual(['100']);
    expect(acknowledged).toHaveLength(0);
    release.resolve();
    await completed.promise;
    expect(fake.versions.slice(0, 2)).toEqual(['100', '356']);
    expect(acknowledged).toEqual(
      events.map((native) => `project-1:cluster:k8s:${native.uid}:${native.resourceVersion}`),
    );
    expect(new Set(acknowledged).size).toBe(300);
  } finally {
    release.resolve();
    await collector.stop();
  }
});
