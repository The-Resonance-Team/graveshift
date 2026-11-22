import { EventEnvelopeSchema, type Signal } from '@graveshift/core';
import type { Publisher } from '@graveshift/events';
import { describe, expect, test } from 'bun:test';

import { createObserver, signalObservation } from './publish';
import { flush, makeContext, rejectingPublisher } from './test-helpers';

const signal = (kind: Signal['kind'], over: Partial<Signal> = {}): Signal => ({
  id: `docker:c1:1:${kind}`,
  service: 'api',
  kind,
  severity: kind === 'oom' || kind === 'crash_loop' ? 'critical' : 'warning',
  source: 'docker',
  fingerprint: `api:${kind}`,
  message: `container shop-api-1 ${kind}`,
  observedAt: '2026-11-22T09:59:00.000Z',
  ...over,
});

describe('createObserver', () => {
  test('publishes one envelope with the observation id and time', async () => {
    const { context, publisher } = makeContext();
    createObserver(context, () => {})({
      id: 'obs-1',
      observedAt: '2026-11-22T09:59:00.000Z',
      traceId: 'trace-1',
      source: 'collector.fake',
      type: 'runtime.oom',
      severity: 'critical',
      fingerprint: 'api:runtime.oom',
      payload: { containerId: 'c1' },
    });
    await flush();

    expect(publisher.envelopes).toHaveLength(1);
    const [envelope] = publisher.envelopes;
    expect(envelope).toBeDefined();
    expect(() => EventEnvelopeSchema.parse(envelope)).not.toThrow();
    expect(envelope).toMatchObject({
      id: 'obs-1',
      projectId: 'project-1',
      service: 'api',
      source: 'collector.fake',
      type: 'runtime.oom',
      severity: 'critical',
      observedAt: '2026-11-22T09:59:00.000Z',
      traceId: 'trace-1',
      fingerprint: 'api:runtime.oom',
    });
  });

  test('redacts secrets in every payload string before publish', async () => {
    const { context, publisher } = makeContext();
    createObserver(context, () => {})({
      id: 'obs-2',
      observedAt: '2026-11-22T09:59:00.000Z',
      traceId: 'trace-1',
      source: 'collector.fake',
      type: 'runtime.restart',
      severity: 'warning',
      fingerprint: 'api:runtime.restart',
      payload: {
        message: 'crashed with Authorization: Bearer abcdefghijklmnop',
        nested: {
          token: 'ghp_abcdefghijklmnopqrstuvwxyz123456',
          count: 2,
          tags: ['Bearer tokentokentoken'],
        },
      },
    });
    await flush();

    const [envelope] = publisher.envelopes;
    const text = JSON.stringify(envelope?.payload ?? {});
    expect(text).not.toContain('abcdefghijkl');
    expect(text).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
    expect(text).toContain('[REDACTED');
  });

  test('a replayed observation rebuilds the same envelope id', async () => {
    const { context, publisher } = makeContext();
    const observation = {
      id: 'docker:c1:1:oom',
      observedAt: '2026-11-22T09:59:00.000Z',
      traceId: 'docker:c1:1:oom',
      source: 'collector.docker',
      type: 'runtime.oom',
      severity: 'critical' as const,
      fingerprint: 'api:oom',
    };
    const observer = createObserver(context, () => {});
    observer(observation);
    observer(observation);
    await flush();
    const ids = publisher.envelopes.map((e) => e.id);
    expect(ids).toEqual(['docker:c1:1:oom', 'docker:c1:1:oom']);
  });

  test('fail open: a bad observation calls warn and never throws', () => {
    const { context, publisher } = makeContext();
    const warnings: string[] = [];
    const observer = createObserver(context, (m) => warnings.push(m));
    expect(() =>
      observer({
        id: 'obs-bad',
        observedAt: '2026-11-22T09:59:00.000Z',
        traceId: 'trace-1',
        source: 'collector.fake',
        type: 'bad type with spaces',
        severity: 'warning',
        fingerprint: 'api:bad',
      }),
    ).not.toThrow();
    expect(publisher.envelopes).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('obs-bad');
  });

  test('fail open: a failing publisher calls warn and never throws', () => {
    const publisher = rejectingPublisher(1);
    const { context } = makeContext({ publisher });
    const warnings: string[] = [];
    const observer = createObserver(context, (m) => warnings.push(m));
    const observation = {
      id: 'obs-3',
      observedAt: '2026-11-22T09:59:00.000Z',
      traceId: 'trace-1',
      source: 'collector.fake',
      type: 'runtime.oom',
      severity: 'critical' as const,
      fingerprint: 'api:oom',
    };
    observer(observation);
    observer(observation);
    // the rejected first publish is reported; the second still goes through
    return new Promise((r) => setTimeout(r, 0)).then(() => {
      expect(publisher.attempted).toHaveLength(2);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('obs-3');
    });
  });
  test('fail open: a publisher that throws synchronously calls warn and never throws', () => {
    const attempted: string[] = [];
    const publisher: Publisher = {
      publish(envelope) {
        attempted.push(envelope.id);
        throw new Error('nats client closed');
      },
    };
    const { context } = makeContext({ publisher });
    const warnings: string[] = [];
    const observer = createObserver(context, (m) => warnings.push(m));
    expect(() =>
      observer({
        id: 'obs-sync',
        observedAt: '2026-11-22T09:59:00.000Z',
        traceId: 'trace-1',
        source: 'collector.fake',
        type: 'runtime.oom',
        severity: 'critical' as const,
        fingerprint: 'api:oom',
      }),
    ).not.toThrow();
    // the synchronous throw became a rejection; the catch reports it
    return new Promise((r) => setTimeout(r, 0)).then(() => {
      expect(attempted).toHaveLength(1);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('obs-sync');
      expect(warnings[0]).toContain('nats client closed');
    });
  });
});

describe('signalObservation', () => {
  test('maps every signal kind to the watcher rule vocabulary', () => {
    const cases: Array<[Signal['kind'], string]> = [
      ['oom', 'runtime.oom'],
      ['crash_loop', 'runtime.restart-loop'],
      ['restart', 'runtime.restart'],
      ['image_pull_backoff', 'k8s.image-pull'],
      ['unhealthy', 'runtime.unhealthy'],
    ];
    for (const [kind, type] of cases) {
      const observation = signalObservation('collector.docker', signal(kind), { action: 'die' });
      expect(observation.type).toBe(type);
      expect(observation.severity).toBe(signal(kind).severity);
      expect(observation.fingerprint).toBe(`api:${kind}`);
      expect(observation.id).toBe(`docker:c1:1:${kind}`);
      expect(observation.traceId).toBe(observation.id);
      expect(observation.observedAt).toBe('2026-11-22T09:59:00.000Z');
      expect(observation.payload).toMatchObject({
        action: 'die',
        message: `container shop-api-1 ${kind}`,
      });
    }
  });
});
