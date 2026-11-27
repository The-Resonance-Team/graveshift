import { describe, expect, test } from 'bun:test';

import { harness, health, log, metric, observation, signal } from './test-helpers';
import { createWatcher } from './watcher';

describe('Wraith observation thresholds through ingest', () => {
  test('requires five error log lines in 60 seconds and ignores ordinary lines', () => {
    const quick = harness();
    for (const seconds of [0, 10, 20, 30]) quick.watcher.ingest(log(seconds));
    expect(quick.outcomes).toHaveLength(0);
    quick.watcher.ingest(log(40));
    expect(quick.accepted('log.error-burst')).toHaveLength(1);
    const spread = harness();
    for (let seconds = 0; seconds < 160; seconds += 20) spread.watcher.ingest(log(seconds));
    expect(spread.outcomes).toHaveLength(0);
    const quiet = harness();
    for (let seconds = 0; seconds < 10; seconds += 1)
      quiet.watcher.ingest(log(seconds, 'GET /candies 200'));
    expect(quiet.outcomes).toHaveLength(0);
  });

  test('requires three restarts in five minutes or one native crash loop observation', () => {
    const slow = harness();
    for (const seconds of [0, 200, 400]) slow.watcher.ingest(signal('restart', seconds));
    expect(slow.outcomes).toHaveLength(0);
    const quick = harness();
    for (const seconds of [0, 100, 250]) quick.watcher.ingest(signal('restart', seconds));
    expect(quick.accepted('runtime.restart-loop')).toHaveLength(1);
    const crash = harness();
    crash.watcher.ingest(signal('crash_loop', 0));
    expect(crash.accepted('runtime.restart-loop')).toHaveLength(1);
  });

  test('detects OOM and image pull observations immediately', () => {
    const captured = harness();
    captured.watcher.ingest(signal('oom', 0));
    captured.watcher.ingest(signal('image_pull_backoff', 1));
    expect(captured.accepted().map((outcome) => outcome.detection.rule)).toEqual([
      'runtime.oom',
      'k8s.image-pull',
    ]);
  });

  test('counts consecutive health failures and resets on a successful check', () => {
    const captured = harness();
    for (const [seconds, ok] of [
      [0, false],
      [15, false],
      [30, true],
      [45, false],
      [60, false],
    ] as const)
      captured.watcher.ingest(health(seconds, ok));
    expect(captured.outcomes).toHaveLength(0);
    captured.watcher.ingest(health(75, false));
    expect(captured.accepted('runtime.unhealthy')).toHaveLength(1);
    const runtime = harness();
    for (const seconds of [0, 5, 10]) runtime.watcher.ingest(signal('unhealthy', seconds));
    expect(runtime.accepted('runtime.unhealthy')).toHaveLength(1);
  });

  test('requires a 5xx rate above five percent for one minute and resets on a dip', () => {
    const captured = harness();
    for (const seconds of [0, 15, 30, 45]) captured.watcher.ingest(metric(seconds, 0.2));
    expect(captured.outcomes).toHaveLength(0);
    captured.watcher.ingest(metric(60, 0.2));
    expect(captured.accepted('metric.5xx-rate')).toHaveLength(1);
    const dip = harness();
    for (const [seconds, rate] of [
      [0, 0.2],
      [30, 0.01],
      [60, 0.2],
      [90, 0.2],
    ] as const)
      dip.watcher.ingest(metric(seconds, rate));
    expect(dip.outcomes).toHaveLength(0);
    const exact = harness();
    for (const seconds of [0, 60]) exact.watcher.ingest(metric(seconds, 0.05));
    expect(exact.outcomes).toHaveLength(0);
  });

  test('requires p95 latency above 1.5 seconds and ignores missing metric samples', () => {
    const captured = harness();
    captured.watcher.ingest(metric(0, null, 1.5));
    captured.watcher.ingest(metric(1, null));
    expect(captured.outcomes).toHaveLength(0);
    captured.watcher.ingest(metric(15, null, 1.81));
    expect(captured.accepted('metric.p95-latency')).toHaveLength(1);
    captured.watcher.ingest(
      observation('metric.sample', 20, { errorRate5xx: 'bad', p95LatencySeconds: 8 }),
    );
    expect(captured.accepted()).toHaveLength(1);
  });

  test('server HTTP errors drive detection while request telemetry and client errors do not', () => {
    const captured = harness();
    captured.watcher.ingest(observation('http.request', 0, { status: 500 }));
    captured.watcher.ingest(
      observation('http.error', 1, { message: 'missing' }, { severity: 'info' }),
    );
    captured.watcher.ingest(
      observation('http.error', 2, { message: 'boom' }, { severity: 'critical' }),
    );
    expect(captured.accepted('http.error')).toHaveLength(1);
  });

  test('crew output and connection events cannot feed detection', () => {
    const captured = harness();
    for (const type of [
      'haunting.opened',
      'haunting.updated',
      'diagnosis.created',
      'fix.completed',
      'audit.entry',
      'collector.disconnected',
      'collector.reconnected',
    ]) {
      captured.watcher.ingest(
        observation(
          type,
          0,
          { line: 'ERROR', errorRate5xx: 1, p95LatencySeconds: 10, kind: 'oom' },
          { severity: 'critical' },
        ),
      );
    }
    expect(captured.outcomes).toHaveLength(0);
    expect(captured.watcher.openIncidents()).toHaveLength(0);
  });

  test('replayed event ids cannot inflate temporal counts', () => {
    const captured = harness();
    for (let count = 0; count < 10; count += 1) captured.watcher.ingest(signal('restart', 0));
    captured.watcher.ingest(signal('restart', 1));
    expect(captured.outcomes).toHaveLength(0);
    captured.watcher.ingest(signal('restart', 2));
    expect(captured.accepted()).toHaveLength(1);
  });

  test('releasing one Project leaves a co-tenant group with the same incident id open', () => {
    const watcher = createWatcher({ newId: () => 'shared-incident', dedupeMs: 0 });
    watcher.ingest(signal('oom', 0, 'api', 'project-1'));
    watcher.ingest(signal('oom', 0, 'api', 'project-2'));
    expect(
      watcher
        .openIncidents()
        .map((entry) => entry.projectId)
        .sort(),
    ).toEqual(['project-1', 'project-2']);
    watcher.release('project-1', 'shared-incident');
    expect(watcher.openIncidents().map((entry) => entry.projectId)).toEqual(['project-2']);
  });
});
