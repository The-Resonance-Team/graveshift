import { describe, expect, test } from 'bun:test';
import type { MetricsClient } from '@graveshift/metrics';
import fc from 'fast-check';

import { createDedupe } from './pipeline';
import { createPoller } from './poller';
import { at, harness, signal, T0 } from './test-helpers';
import type { Detection } from './types';

describe('poller', () => {
  const client = (values: Record<string, number | null>, fail = false): MetricsClient => ({
    query: async () => null,
    watcher: async (name) => {
      if (fail) throw new Error('prometheus down');
      return values[name] ?? null;
    },
  });

  test('feeds PromQL samples into the metric rules', async () => {
    const h = harness();
    let now = T0;
    const poller = createPoller({
      client: client({ errorRate5xx: 0.3, p95LatencySeconds: 2 }),
      watcher: h.watcher,
      targets: [{ service: 'api', job: 'demo-api' }],
      now: () => new Date(now),
    });
    await [0, 1, 2, 3, 4].reduce(
      (previous) =>
        previous.then(async () => {
          await poller.pollOnce();
          now += 15_000;
        }),
      Promise.resolve(),
    );
    expect(h.accepted('metric.p95-latency')).toHaveLength(1);
    expect(h.accepted('metric.5xx-rate')).toHaveLength(1);
  });

  test('a failing query warns and never throws', async () => {
    const warnings: string[] = [];
    const h = harness();
    const poller = createPoller({
      client: client({}, true),
      watcher: h.watcher,
      targets: [{ service: 'api', job: 'demo-api' }],
      warn: (m) => warnings.push(m),
    });
    await poller.pollOnce();
    expect(warnings).toHaveLength(1);
    expect(h.outcomes).toHaveLength(0);
  });
});

describe('properties', () => {
  const detection = (service: string, seconds: number): Detection => ({
    id: `d-${service}-${seconds}`,
    rule: 'runtime.oom',
    service,
    severity: 'critical',
    fingerprint: `${service}:runtime.oom`,
    message: 'oom',
    observedAt: at(seconds),
  });
  const sequence = fc
    .array(
      fc.record({
        service: fc.constantFrom('api', 'worker', 'db'),
        seconds: fc.integer({ min: 0, max: 5000 }),
      }),
      { maxLength: 40 },
    )
    .map((items) =>
      items.sort((a, b) => a.seconds - b.seconds).map((i) => detection(i.service, i.seconds)),
    );

  const run = (items: Detection[]) => {
    const dedupe = createDedupe();
    return items.filter((d) => dedupe.accept(d));
  };

  test('dedupe is stable: idempotent, spaced by the window, and keeps the first of every fingerprint', () => {
    fc.assert(
      fc.property(sequence, (items) => {
        const kept = run(items);
        expect(run(kept)).toEqual(kept);
        const byFingerprint = Map.groupBy(kept, (d) => d.fingerprint);
        for (const group of byFingerprint.values()) {
          for (let i = 1; i < group.length; i++) {
            expect(
              Date.parse(group[i]!.observedAt) - Date.parse(group[i - 1]!.observedAt),
            ).toBeGreaterThanOrEqual(600_000);
          }
        }
        for (const [fp, first] of Map.groupBy(items, (d) => d.fingerprint)) {
          expect(byFingerprint.get(fp)?.[0]).toEqual(first[0]);
        }
      }),
    );
  });

  test('grouping: exactly one open incident per service and every accepted signal id is attached once', () => {
    fc.assert(
      fc.property(sequence, (items) => {
        const h = harness();
        for (const d of items) {
          h.watcher.ingest(signal('oom', (Date.parse(d.observedAt) - T0) / 1000, d.service));
        }
        const open = h.watcher.openIncidents();
        expect(new Set(open.map((o) => o.incident.service)).size).toBe(open.length);
        const attached = open.flatMap((o) => o.incident.signalIds);
        expect(new Set(attached).size).toBe(attached.length);
        expect(attached.length).toBe(h.accepted().length);
      }),
    );
  });

  test('silenced detections never become incidents', () => {
    fc.assert(
      fc.property(sequence, (items) => {
        const h = harness();
        h.watcher.silence({ service: 'api', from: at(0), until: at(10_000) });
        for (const d of items)
          h.watcher.ingest(signal('oom', (Date.parse(d.observedAt) - T0) / 1000, d.service));
        expect(h.watcher.openIncidents().some((o) => o.incident.service === 'api')).toBe(false);
      }),
    );
  });
});
