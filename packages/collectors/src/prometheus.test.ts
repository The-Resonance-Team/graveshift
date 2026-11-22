import type { MetricsClient, WatcherQuery } from '@graveshift/metrics';
import { EventEnvelopeSchema } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import { createPrometheusCollector } from './prometheus';
import { fixedClock, hangingSleep, makeContext, rejectingPublisher, flush } from './test-helpers';

interface FakeClientOptions {
  values: Partial<Record<WatcherQuery, number | null | Error>>;
  calls: Array<{ query: WatcherQuery; job: string }>;
}

function fakeClient(options: FakeClientOptions): MetricsClient {
  return {
    async query(promql) {
      options.calls.push({ query: promql as WatcherQuery, job: '-' });
      return null;
    },
    async watcher(query, job) {
      options.calls.push({ query, job });
      const value = options.values[query];
      if (value instanceof Error) throw value;
      return value ?? null;
    },
  };
}

const allValues: Partial<Record<WatcherQuery, number>> = {
  up: 1,
  requestRate: 12.5,
  errorRate5xx: 0.02,
  p95LatencySeconds: 0.31,
  residentMemoryBytes: 52_428_800,
};

async function startedCollector(options: FakeClientOptions) {
  const setup = makeContext();
  const warnings: string[] = [];
  const { sleep, delays } = hangingSleep();
  const collector = createPrometheusCollector({
    client: fakeClient(options),
    intervalMs: 60_000,
    sleep,
    clock: fixedClock,
    warn: (m) => warnings.push(m),
  });
  await collector.start(setup.context);
  return { ...setup, collector, warnings, delays };
}

describe('prometheus collector', () => {
  test('publishes one info envelope per numeric sample on start', async () => {
    const calls: FakeClientOptions['calls'] = [];
    const { collector, publisher, warnings } = await startedCollector({ values: allValues, calls });

    expect(warnings).toEqual([]);
    // every watcher query runs with the grave as the job
    expect(calls.map((c) => c.job)).toEqual(['api', 'api', 'api', 'api', 'api']);
    expect(calls.map((c) => c.query)).toEqual([
      'up',
      'requestRate',
      'errorRate5xx',
      'p95LatencySeconds',
      'residentMemoryBytes',
    ]);

    const envelopes = publisher.envelopes;
    expect(envelopes).toHaveLength(5);
    for (const envelope of envelopes)
      expect(() => EventEnvelopeSchema.parse(envelope)).not.toThrow();
    expect(
      envelopes.map((e) => [e.source, e.service, e.projectId, e.type, e.severity, e.fingerprint]),
    ).toEqual([
      ['collector.prometheus', 'api', 'project-1', 'metric.up', 'info', 'api:metric.up'],
      [
        'collector.prometheus',
        'api',
        'project-1',
        'metric.request-rate',
        'info',
        'api:metric.request-rate',
      ],
      [
        'collector.prometheus',
        'api',
        'project-1',
        'metric.5xx-rate',
        'info',
        'api:metric.5xx-rate',
      ],
      [
        'collector.prometheus',
        'api',
        'project-1',
        'metric.p95-latency',
        'info',
        'api:metric.p95-latency',
      ],
      [
        'collector.prometheus',
        'api',
        'project-1',
        'metric.resident-memory-bytes',
        'info',
        'api:metric.resident-memory-bytes',
      ],
    ]);
    // one trace id spans the cycle; ids stay unique per query
    const traceIds = new Set(envelopes.map((e) => e.traceId));
    expect(traceIds).toEqual(new Set(['trace-cycle-1']));
    expect(new Set(envelopes.map((e) => e.id)).size).toBe(5);
    expect(envelopes[0]?.payload).toEqual({ query: 'up', value: 1 });
    await collector.stop();
  });

  test('skips queries with no sample', async () => {
    const calls: FakeClientOptions['calls'] = [];
    const { collector, publisher } = await startedCollector({
      values: { up: 0, errorRate5xx: null },
      calls,
    });
    expect(publisher.envelopes).toHaveLength(1);
    expect(publisher.envelopes[0]).toMatchObject({
      type: 'metric.up',
      payload: { query: 'up', value: 0 },
    });
    await collector.stop();
  });

  test('fail open: a failed query is reported and the cycle continues', async () => {
    const calls: FakeClientOptions['calls'] = [];
    const { collector, publisher, warnings } = await startedCollector({
      values: { ...allValues, errorRate5xx: new Error('prometheus responded 500') },
      calls,
    });
    expect(publisher.envelopes).toHaveLength(4);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('prometheus responded 500');
    await collector.stop();
  });

  test('fail open: a rejected publish is reported and start still resolves', async () => {
    const calls: FakeClientOptions['calls'] = [];
    const publisher = rejectingPublisher(5);
    const { context } = makeContext({ publisher });
    const warnings: string[] = [];
    const { sleep } = hangingSleep();
    const collector = createPrometheusCollector({
      client: fakeClient({ values: allValues, calls }),
      sleep,
      clock: fixedClock,
      warn: (m) => warnings.push(m),
    });
    await expect(collector.start(context)).resolves.toBeUndefined();
    await flush();
    expect(publisher.attempted).toHaveLength(5);
    expect(warnings).toHaveLength(5);
    expect(warnings[0]).toContain('nats unavailable');
    await collector.stop();
  });

  test('fail closed: start rejects a bad context and a client-less config', async () => {
    const calls: FakeClientOptions['calls'] = [];
    const publisher = makeContext().publisher;
    const client = fakeClient({ values: allValues, calls });

    const noSource = createPrometheusCollector({ clock: fixedClock });
    await expect(noSource.start(makeContext().context)).rejects.toThrow('client or a baseUrl');

    const collector = createPrometheusCollector({ client, clock: fixedClock });
    await expect(collector.start(undefined as never)).rejects.toThrow('object');
    await expect(
      collector.start({ publisher: {} as never, projectId: 'p', service: 'api' }),
    ).rejects.toThrow('publisher');
    await expect(
      collector.start({ publisher, projectId: 'bad project', service: 'api' }),
    ).rejects.toThrow('projectId');
    await expect(collector.start({ publisher, projectId: 'p', service: '' })).rejects.toThrow(
      'service',
    );
    expect(calls).toEqual([]);
    await collector.stop();
  });

  test('pollOnce is a no-op before start and after stop', async () => {
    const calls: FakeClientOptions['calls'] = [];
    const collector = createPrometheusCollector({
      client: fakeClient({ values: allValues, calls }),
      clock: fixedClock,
    });
    await collector.pollOnce();
    expect(calls).toEqual([]);

    await startedCollector({ values: allValues, calls });
    const { collector: running } = await startedCollector({ values: allValues, calls });
    await running.stop();
    calls.length = 0;
    await running.pollOnce();
    expect(calls).toEqual([]);
  });

  test('fail closed: a second start is rejected until stop runs', async () => {
    const calls: FakeClientOptions['calls'] = [];
    const collector = createPrometheusCollector({
      client: fakeClient({ values: {}, calls }),
      sleep: hangingSleep().sleep,
      clock: fixedClock,
    });
    await collector.start(makeContext().context);
    await expect(collector.start(makeContext().context)).rejects.toThrow(
      'prometheus collector is already started',
    );
    await collector.stop();
    await collector.start(makeContext().context);
    await collector.stop();
  });

  test('the poll loop repeats at the interval and stops on stop', async () => {
    const calls: FakeClientOptions['calls'] = [];
    let wake: (() => void) | undefined;
    const sleep = async (_ms: number, signal: AbortSignal): Promise<void> => {
      if (signal.aborted) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    };
    const { context, publisher } = makeContext();
    const collector = createPrometheusCollector({
      client: fakeClient({ values: { up: 1 }, calls }),
      intervalMs: 1_000,
      sleep,
      clock: fixedClock,
    });
    await collector.start(context);
    expect(publisher.envelopes).toHaveLength(1);

    wake?.();
    await flush();
    expect(publisher.envelopes).toHaveLength(2);

    await collector.stop();
    await flush();
    expect(publisher.envelopes).toHaveLength(2);
  });
});
