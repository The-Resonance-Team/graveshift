import { EnvelopeError, type Rule } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import { at, harness, log, metric, signal } from './test-helpers';
import { createWatcher } from './watcher';

describe('Wraith grouping and controls', () => {
  test('deduplicates fingerprints for ten minutes without crossing Graves or projects', () => {
    const captured = harness();
    for (const seconds of [0, 599, 600]) captured.watcher.ingest(signal('oom', seconds));
    captured.watcher.ingest(signal('oom', 1, 'worker'));
    captured.watcher.ingest(signal('oom', 1, 'api', 'project-2'));
    expect(captured.outcomes.map((outcome) => outcome.status)).toEqual([
      'accepted',
      'duplicate',
      'accepted',
      'accepted',
      'accepted',
    ]);
  });

  test('groups a Haunting per project and Grave and preserves the highest severity', () => {
    const captured = harness();
    for (let seconds = 0; seconds < 5; seconds += 1) captured.watcher.ingest(log(seconds));
    captured.watcher.ingest(signal('oom', 10));
    captured.watcher.ingest(signal('oom', 11, 'api', 'project-2'));
    const changes = captured
      .accepted()
      .flatMap((outcome) => (outcome.status === 'accepted' ? [outcome.change] : []));
    expect(changes.map((change) => [change.type, change.incident.id, change.severity])).toEqual([
      ['opened', 'inc-1', 'warning'],
      ['updated', 'inc-1', 'critical'],
      ['opened', 'inc-2', 'critical'],
    ]);
    expect(changes[1]?.incident.signalIds).toHaveLength(2);
    expect(changes[2]?.projectId).toBe('project-2');
  });

  test('release is project scoped and snapshots cannot mutate the live Haunting', () => {
    const captured = harness();
    captured.watcher.ingest(signal('oom', 0));
    const snapshot = captured.watcher.openIncidents();
    snapshot[0]!.incident.signalIds.push('tampered');
    expect(captured.watcher.openIncidents()[0]?.incident.signalIds).not.toContain('tampered');
    captured.watcher.release('project-2', 'inc-1');
    expect(captured.watcher.openIncidents()).toHaveLength(1);
    captured.watcher.release('project-1', 'inc-1');
    captured.watcher.ingest(signal('image_pull_backoff', 5));
    expect(captured.watcher.openIncidents()[0]?.incident.id).toBe('inc-2');
  });

  test('Salt lines have project scope and do not start a fingerprint dedupe window', () => {
    const captured = harness();
    captured.watcher.silence({
      projectId: 'project-1',
      service: 'api',
      from: at(0),
      until: at(300),
    });
    captured.watcher.ingest(signal('oom', 10));
    captured.watcher.ingest(signal('oom', 10, 'api', 'project-2'));
    captured.watcher.ingest(signal('oom', 300));
    expect(captured.outcomes.map((outcome) => outcome.status)).toEqual([
      'suppressed',
      'accepted',
      'accepted',
    ]);
  });
});

describe('Core rule composition and event metadata', () => {
  const system: Rule = {
    id: 'latency',
    enabled: true,
    priority: 1,
    match: { types: ['metric.sample'] },
    action: 'suppress',
  };

  test('applies client rules by id before Salt line, dedupe and grouping decisions', () => {
    const blocked = harness({ systemRules: [system] });
    blocked.watcher.ingest(metric(0, null, 2));
    expect(blocked.outcomes[0]?.status).toBe('suppressed');
    const overridden = harness({
      systemRules: [system],
      clientRules: [{ ...system, action: 'detect' }],
    });
    overridden.watcher.ingest(metric(0, null, 2));
    expect(overridden.outcomes[0]?.status).toBe('accepted');
    const escalated = harness({ clientRules: [{ ...system, action: 'escalate' }] });
    escalated.watcher.ingest(metric(0, null, 2));
    expect(escalated.outcomes[0]?.detection.severity).toBe('critical');
  });

  test('keeps approved event identity and project trace relationships in outcomes', () => {
    const captured = harness();
    const envelope = {
      ...signal('oom', 0),
      id: '7f97b5f2-4952-4e29-b76c-50f8461965f0',
      traceId: 'bb7dfb30-af65-42bb-a47b-229fb067ab1d',
      payload: { password: 'secret', message: 'failed for ops@example.com' },
    };
    const [outcome] = captured.watcher.ingest(envelope);
    expect(outcome?.envelope).toMatchObject({
      id: envelope.id,
      traceId: envelope.traceId,
      projectId: envelope.projectId,
      fingerprint: envelope.fingerprint,
    });
    expect(outcome?.detection).toMatchObject({
      eventId: envelope.id,
      traceId: envelope.traceId,
      projectId: envelope.projectId,
    });
    expect(JSON.stringify(outcome)).not.toContain('ops@example.com');
    expect(outcome?.envelope.payload).not.toHaveProperty('password');
    expect(() => captured.watcher.ingest({ ...envelope, traceId: 'ops@example.com' })).toThrow(
      EnvelopeError,
    );
  });

  test('a throwing outcome callback cannot interrupt detection or the next observation', () => {
    const watcher = createWatcher({
      onOutcome: () => {
        throw new Error('subscriber failed');
      },
    });
    expect(watcher.ingest(signal('oom', 0))).toHaveLength(1);
    expect(watcher.ingest(signal('image_pull_backoff', 1))).toHaveLength(1);
    expect(watcher.openIncidents()[0]?.incident.signalIds).toHaveLength(2);
  });

  test('a rejected asynchronous outcome observer cannot interrupt later observations', async () => {
    const watcher = createWatcher({
      onOutcome: () => Promise.reject(new Error('subscriber failed')),
    });
    expect(watcher.ingest(signal('oom', 0))).toHaveLength(1);
    expect(watcher.ingest(signal('image_pull_backoff', 1))).toHaveLength(1);
    await Promise.resolve();
    expect(watcher.openIncidents()[0]?.incident.signalIds).toHaveLength(2);
  });
});
