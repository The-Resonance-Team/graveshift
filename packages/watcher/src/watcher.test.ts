import { describe, expect, test } from 'bun:test';
import { mapDockerEvent } from '@graveshift/sources-docker';
import { mapK8sEvent } from '@graveshift/sources-k8s';

import { at, harness, signal, T0 } from './test-helpers';

describe('rules', () => {
  test('log.error-burst fires at 5 errors in 60 s, not 4, not when spread out', () => {
    const four = harness();
    for (let i = 0; i < 4; i++) four.watcher.log('api', 'ERROR boom', at(i * 10));
    expect(four.outcomes).toHaveLength(0);

    const five = harness();
    for (let i = 0; i < 5; i++) five.watcher.log('api', 'ERROR boom', at(i * 10));
    expect(five.accepted('log.error-burst')).toHaveLength(1);

    const spread = harness();
    for (let i = 0; i < 8; i++) spread.watcher.log('api', 'ERROR boom', at(i * 20));
    expect(spread.outcomes).toHaveLength(0);

    const quiet = harness();
    for (let i = 0; i < 10; i++) quiet.watcher.log('api', 'GET /candies/1 200', at(i));
    expect(quiet.outcomes).toHaveLength(0);
  });

  test('runtime.restart-loop fires at 3 restarts in 5 min or on crash_loop', () => {
    const slow = harness();
    for (const s of [0, 200, 400]) slow.watcher.ingest(signal('restart', s));
    expect(slow.outcomes).toHaveLength(0);

    const quick = harness();
    for (const s of [0, 100, 250]) quick.watcher.ingest(signal('restart', s));
    expect(quick.accepted('runtime.restart-loop')).toHaveLength(1);

    const crash = harness();
    crash.watcher.ingest(signal('crash_loop', 0, 'worker', 'k8s'));
    expect(crash.accepted('runtime.restart-loop')).toHaveLength(1);
  });

  test('runtime.oom fires on an oom signal', () => {
    const h = harness();
    h.watcher.ingest(signal('oom', 0));
    expect(h.accepted('runtime.oom')).toHaveLength(1);
  });

  test('runtime.unhealthy needs 3 consecutive failed checks and resets on success', () => {
    const h = harness();
    h.watcher.healthCheck('api', false, at(0));
    h.watcher.healthCheck('api', false, at(15));
    h.watcher.healthCheck('api', true, at(30));
    h.watcher.healthCheck('api', false, at(45));
    h.watcher.healthCheck('api', false, at(60));
    expect(h.outcomes).toHaveLength(0);
    h.watcher.healthCheck('api', false, at(75));
    expect(h.accepted('runtime.unhealthy')).toHaveLength(1);

    const events = harness();
    for (const s of [0, 5, 10]) events.watcher.ingest(signal('unhealthy', s));
    expect(events.accepted('runtime.unhealthy')).toHaveLength(1);
  });

  test('metric.5xx-rate needs more than 5% held for 1 min', () => {
    const h = harness();
    for (const s of [0, 15, 30, 45])
      h.watcher.metrics('api', { errorRate5xx: 0.2, p95LatencySeconds: null }, at(s));
    expect(h.outcomes).toHaveLength(0);
    h.watcher.metrics('api', { errorRate5xx: 0.2, p95LatencySeconds: null }, at(60));
    expect(h.accepted('metric.5xx-rate')).toHaveLength(1);

    const dip = harness();
    for (const [s, rate] of [
      [0, 0.2],
      [30, 0.01],
      [60, 0.2],
      [90, 0.2],
    ] as const) {
      dip.watcher.metrics('api', { errorRate5xx: rate, p95LatencySeconds: null }, at(s));
    }
    expect(dip.outcomes).toHaveLength(0);

    const exact = harness();
    for (const s of [0, 60])
      exact.watcher.metrics('api', { errorRate5xx: 0.05, p95LatencySeconds: null }, at(s));
    expect(exact.outcomes).toHaveLength(0);
  });

  test('metric.p95-latency fires above 1.5 s only', () => {
    const h = harness();
    h.watcher.metrics('api', { errorRate5xx: null, p95LatencySeconds: 1.5 }, at(0));
    expect(h.outcomes).toHaveLength(0);
    h.watcher.metrics('api', { errorRate5xx: null, p95LatencySeconds: 1.81 }, at(15));
    expect(h.accepted('metric.p95-latency')).toHaveLength(1);
  });

  test('k8s.image-pull fires on image_pull_backoff', () => {
    const h = harness();
    h.watcher.ingest(signal('image_pull_backoff', 0, 'api', 'k8s'));
    expect(h.accepted('k8s.image-pull')).toHaveLength(1);
  });
});

describe('dedupe, grouping, severity, silence', () => {
  test('a repeated fingerprint inside 10 min is a duplicate, after 10 min it fires again', () => {
    const h = harness();
    h.watcher.ingest(signal('oom', 0));
    h.watcher.ingest(signal('oom', 599));
    h.watcher.ingest(signal('oom', 600));
    expect(h.outcomes.map((o) => o.status)).toEqual(['accepted', 'duplicate', 'accepted']);
  });

  test('different services do not dedupe each other', () => {
    const h = harness();
    h.watcher.ingest(signal('oom', 0, 'api'));
    h.watcher.ingest(signal('oom', 1, 'worker'));
    expect(h.accepted()).toHaveLength(2);
  });

  test('signals for one service group into one incident, other services get their own', () => {
    const h = harness();
    h.watcher.ingest(signal('oom', 0));
    h.watcher.ingest(signal('image_pull_backoff', 5, 'api', 'k8s'));
    h.watcher.ingest(signal('oom', 6, 'worker'));
    const changes = h.accepted().map((o) => (o.status === 'accepted' ? o.change : null));
    expect(changes.map((c) => [c?.type, c?.incident.id])).toEqual([
      ['opened', 'inc-1'],
      ['updated', 'inc-1'],
      ['opened', 'inc-2'],
    ]);
    expect(changes[1]?.incident.signalIds).toHaveLength(2);
    expect(changes[1]?.incident.state).toBe('open');
  });

  test('severity is the highest of the incident signals', () => {
    const h = harness();
    for (let i = 0; i < 5; i++) h.watcher.log('api', 'error x', at(i));
    const first = h.accepted()[0];
    expect(first?.status === 'accepted' && first.change.severity).toBe('warning');
    h.watcher.ingest(signal('oom', 10));
    const last = h.accepted().at(-1);
    expect(last?.status === 'accepted' && last.change.severity).toBe('critical');
  });

  test('released incidents let the next signal open a new incident', () => {
    const h = harness();
    h.watcher.ingest(signal('oom', 0));
    h.watcher.release('inc-1');
    h.watcher.ingest(signal('image_pull_backoff', 5, 'api', 'k8s'));
    expect(h.accepted().map((o) => (o.status === 'accepted' ? o.change.incident.id : ''))).toEqual([
      'inc-1',
      'inc-2',
    ]);
  });

  test('a salt line suppresses signals inside the window only, and does not start a dedupe window', () => {
    const h = harness();
    h.watcher.silence({ service: 'api', from: at(0), until: at(300) });
    h.watcher.ingest(signal('oom', 10));
    h.watcher.ingest(signal('oom', 10, 'worker'));
    h.watcher.ingest(signal('oom', 300));
    expect(h.outcomes.map((o) => o.status)).toEqual(['suppressed', 'accepted', 'accepted']);
  });
});

describe('both runtime sources', () => {
  test('docker oom and k8s image pull each create an incident via the real mappers', () => {
    const h = harness();
    const docker = mapDockerEvent(
      { Type: 'container', Action: 'oom', Actor: { ID: 'c1', Attributes: {} }, time: T0 / 1000 },
      'worker',
    );
    const k8s = mapK8sEvent({
      uid: 'u1',
      reason: 'Failed',
      message: 'Error: ErrImagePull',
      type: 'Warning',
      namespace: 'candy-shop',
      involvedKind: 'Pod',
      involvedName: 'api-5d8f9c7b6d-x2k4q',
      resourceVersion: '1',
      at: at(1),
    });
    for (const s of [docker, k8s]) if (s) h.watcher.ingest({ kind: 'signal', signal: s });
    expect(h.accepted().map((o) => o.detection.rule)).toEqual(['runtime.oom', 'k8s.image-pull']);
    expect(h.watcher.openIncidents().map((i) => i.incident.service)).toEqual(['worker', 'api']);
  });

  test('connection events are ignored', () => {
    const h = harness();
    h.watcher.ingest({ kind: 'source_disconnected', at: at(0), reason: 'EOF' });
    expect(h.outcomes).toHaveLength(0);
  });
});
