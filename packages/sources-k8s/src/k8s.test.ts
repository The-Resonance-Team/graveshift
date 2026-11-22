import { EventEnvelopeSchema } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import { createK8sCollector, K8sSourceError } from './source';
import { clock, context, fakeApi, fixture } from './test-helpers';
import { WatchExpiredError, type K8sEvent } from './types';

describe('Kubernetes Collector', () => {
  test('uses one qualified Grave name for inventory, evidence reads and publication', async () => {
    const ready = Promise.withResolvers<void>();
    const fake = fakeApi([[fixture(), fixture({ uid: 'uid-2', namespace: 'other' })]]);
    const collected = context((envelope) => {
      if (envelope.service === 'cluster__other__api' && envelope.type === 'runtime.oom')
        ready.resolve();
    });
    const collector = createK8sCollector({ api: fake.api, clock });
    collector.start(collected.value);
    expect(await collector.listServices()).toEqual([
      { name: 'cluster__shop__api', runtime: 'k8s', namespace: 'shop' },
      { name: 'cluster__other__api', runtime: 'k8s', namespace: 'other' },
    ]);
    expect((await collector.getHealth('cluster__shop__api')).status).toBe('healthy');
    expect((await collector.getHealth('cluster__other__api')).status).toBe('unhealthy');
    expect(await collector.tailLogs('cluster__other__api', 2)).toEqual(['two', 'three']);
    expect(fake.reads).toEqual(['pods:other:other-api', 'logs:other:pod-1:2']);
    await expect(collector.tailLogs('api', 1)).rejects.toBeInstanceOf(K8sSourceError);
    await ready.promise;
    await collector.stop();
    const observations = collected.envelopes.filter((envelope) =>
      envelope.type.startsWith('runtime.'),
    );
    expect(new Set(observations.map((envelope) => envelope.fingerprint)).size).toBe(4);
    expect(observations[0]).toMatchObject({
      id: 'project-1:cluster:k8s:uid-1:101',
      projectId: 'project-1',
      service: 'cluster__shop__api',
      source: 'collector.k8s',
      type: 'runtime.crash_loop',
      severity: 'critical',
      observedAt: clock.now(),
    });
    for (const envelope of observations) EventEnvelopeSchema.parse(envelope);
  });

  test('resumes one cursor, removes duplicate native events and relists after 410', async () => {
    const finished = Promise.withResolvers<void>();
    const first = fixture();
    const fake = fakeApi([
      [first],
      new WatchExpiredError(),
      [first, fixture({ resourceVersion: '102', reason: 'Unhealthy' })],
    ]);
    const collected = context((envelope) => {
      if (envelope.type === 'runtime.unhealthy') finished.resolve();
    });
    const delays: number[] = [];
    const collector = createK8sCollector({
      api: fake.api,
      clock,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    collector.start(collected.value);
    expect(() => collector.start(collected.value)).toThrow('already active');
    await finished.promise;
    await collector.stop();
    expect(fake.versions.slice(0, 3)).toEqual(['100', '101', '100']);
    expect(delays.slice(0, 2)).toEqual([500, 1000]);
    expect(
      collected.envelopes.filter((envelope) => envelope.type === 'runtime.crash_loop'),
    ).toHaveLength(1);
    expect(fake.signals.every((signal) => signal.aborted)).toBe(true);
  });

  test('publisher failures do not drop later observations or OOM enrichment', async () => {
    const finished = Promise.withResolvers<void>();
    const fake = fakeApi([[fixture(), fixture({ uid: 'uid-2', reason: 'Unhealthy' })]]);
    let failed = false;
    const collected = context((envelope) => {
      if (envelope.type === 'runtime.unhealthy') finished.resolve();
      if (envelope.type === 'runtime.crash_loop' && !failed) {
        failed = true;
        throw new Error('broker unavailable');
      }
    });
    const collector = createK8sCollector({ api: fake.api, clock, sleep: async () => {} });
    collector.start(collected.value);
    await finished.promise;
    await collector.stop();
    expect(collected.envelopes.map((envelope) => envelope.type)).toEqual(
      expect.arrayContaining(['runtime.crash_loop', 'runtime.oom', 'runtime.unhealthy']),
    );
  });

  const cases: Array<[Partial<K8sEvent>, string | null]> = [
    [{ reason: 'OOMKilling' }, 'runtime.oom'],
    [{}, 'runtime.crash_loop'],
    [{ reason: 'Failed', message: 'Error: ErrImagePull' }, 'runtime.image_pull_backoff'],
    [{ reason: 'BackOff', message: 'Back-off pulling image' }, 'runtime.image_pull_backoff'],
    [{ reason: 'Unhealthy' }, 'runtime.unhealthy'],
    [{ reason: 'Killing', message: 'failed liveness probe' }, 'runtime.restart'],
    [{ type: 'Normal' }, null],
  ];
  for (const [overrides, expected] of cases) {
    test(`normalizes ${overrides.reason ?? 'BackOff'} ${overrides.type ?? 'Warning'}`, async () => {
      const observed = Promise.withResolvers<void>();
      const fake = fakeApi([[fixture(overrides)]]);
      const collected = context((envelope) => {
        if (envelope.type === expected || envelope.type === 'collector.disconnected')
          observed.resolve();
      });
      const collector = createK8sCollector({ api: fake.api, clock });
      collector.start(collected.value);
      await observed.promise;
      await collector.stop();
      const first = collected.envelopes.find((envelope) => envelope.type.startsWith('runtime.'));
      expect(first?.type ?? null).toBe(expected);
    });
  }

  test('rejects invalid context before acquiring and keeps configured namespace scope', async () => {
    const fake = fakeApi();
    const collected = context();
    const collector = createK8sCollector({ api: fake.api, namespaces: ['other'], clock });
    expect(() => collector.start({ ...collected.value, projectId: 'bad project' })).toThrow();
    expect(fake.versions).toHaveLength(0);
    collector.start(collected.value);
    expect((await collector.listServices()).map((grave) => grave.name)).toEqual([
      'cluster__other__api',
    ]);
    await collector.stop();
  });
});
