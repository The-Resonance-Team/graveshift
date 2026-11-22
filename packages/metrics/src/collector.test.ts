import { EventEnvelopeSchema, type EventEnvelope } from '@graveshift/core';
import type { Clock, Context } from '@graveshift/integrations';
import { describe, expect, test } from 'bun:test';

import { createMetricsClient } from './client';
import { createPrometheusCollector } from './collector';

const anchor = Date.parse('2026-11-20T10:00:00.000Z');
const untilAbort = (_ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', () => resolve(), { once: true });
  });
function capture(publish: (envelope: EventEnvelope) => void = () => {}) {
  const envelopes: EventEnvelope[] = [];
  const context: Context = {
    projectId: 'project-1',
    service: 'metrics',
    publisher: {
      async publish(envelope) {
        envelopes.push(envelope);
        publish(envelope);
      },
    },
  };
  return { context, envelopes };
}

describe('Prometheus Collector', () => {
  test('owns a non overlapping schedule and publishes observations at query start time', async () => {
    let now = anchor;
    let count = 0;
    const clock: Clock = {
      now: () => new Date(now).toISOString(),
      newId: () => `sample-${++count}`,
    };
    const finished = Promise.withResolvers<void>();
    const captured = capture(() => {
      if (captured.envelopes.length === 5) finished.resolve();
    });
    const queries: string[] = [];
    const fetchFn: typeof fetch = Object.assign(
      async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : input);
        queries.push(url.searchParams.get('query') ?? '');
        const value = queries.length % 2 === 1 ? '0.3' : '2';
        return Response.json({ status: 'success', data: { result: [{ value: [1, value] }] } });
      },
      { preconnect() {} },
    );
    const delays: number[] = [];
    const collector = createPrometheusCollector({
      client: createMetricsClient('http://prom.invalid', fetchFn),
      targets: [{ service: 'api', job: 'shop-api' }],
      clock,
      sleep: (ms, signal) => {
        delays.push(ms);
        now += ms;
        return delays.length < 5 ? Promise.resolve() : untilAbort(ms, signal);
      },
    });
    collector.start(captured.context);
    expect(() => collector.start(captured.context)).toThrow('already active');
    await finished.promise;
    await collector.stop();
    expect(queries).toHaveLength(10);
    expect(delays.every((ms) => ms === 15_000)).toBe(true);
    expect(captured.envelopes.map((envelope) => envelope.observedAt)).toEqual(
      [0, 15, 30, 45, 60].map((seconds) => new Date(anchor + seconds * 1000).toISOString()),
    );
    for (const envelope of captured.envelopes) {
      EventEnvelopeSchema.parse(envelope);
      expect(envelope).toMatchObject({
        service: 'api',
        projectId: 'project-1',
        source: 'collector.prometheus',
        type: 'metric.sample',
        severity: 'info',
        payload: { job: 'shop-api', errorRate5xx: 0.3, p95LatencySeconds: 2 },
      });
    }
  });

  test('query and publisher failures do not end later intervals', async () => {
    let cycle = 0;
    const finished = Promise.withResolvers<void>();
    const captured = capture(() => {
      if (cycle === 1) throw new Error('delivery failed');
      finished.resolve();
    });
    const collector = createPrometheusCollector({
      targets: [{ service: 'api', job: 'api' }],
      client: {
        query: async () => null,
        watcher: async () => {
          if (cycle === 0) throw new Error('query failed');
          return null;
        },
      },
      sleep: (_ms, signal) => {
        cycle += 1;
        return cycle < 3 ? Promise.resolve() : untilAbort(1, signal);
      },
    });
    collector.start(captured.context);
    await finished.promise;
    await collector.stop();
    expect(captured.envelopes).toHaveLength(2);
    expect(captured.envelopes[1]?.payload).toEqual({
      job: 'api',
      errorRate5xx: null,
      p95LatencySeconds: null,
    });
  });

  test('stop aborts in flight HTTP queries, waits for both and publishes no late sample', async () => {
    const entered = Promise.withResolvers<void>();
    const pending = Promise.withResolvers<Response>();
    const signals: AbortSignal[] = [];
    const fetchFn: typeof fetch = Object.assign(
      (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        if (signals.length === 2) entered.resolve();
        return pending.promise;
      },
      { preconnect() {} },
    );
    const captured = capture();
    const collector = createPrometheusCollector({
      client: createMetricsClient('http://unused.invalid', fetchFn),
      targets: [{ service: 'api', job: 'api' }],
    });
    collector.start(captured.context);
    await entered.promise;
    let stopped = false;
    const stopping = Promise.resolve(collector.stop()).then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(stopped).toBe(false);
    pending.resolve(Response.json({ status: 'success', data: { result: [] } }));
    await stopping;
    expect(captured.envelopes).toHaveLength(0);
  });

  test('one rejected query does not leave the other query outside stop ownership', async () => {
    const pending = Promise.withResolvers<number | null>();
    const entered = Promise.withResolvers<void>();
    const collector = createPrometheusCollector({
      targets: [{ service: 'api', job: 'api' }],
      client: {
        query: async () => null,
        watcher: (name) => {
          entered.resolve();
          return name === 'errorRate5xx' ? Promise.reject(new Error('failed')) : pending.promise;
        },
      },
    });
    const captured = capture();
    collector.start(captured.context);
    await entered.promise;
    let stopped = false;
    const stopping = Promise.resolve(collector.stop()).then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    pending.resolve(2);
    await stopping;
    expect(captured.envelopes).toHaveLength(0);
  });

  test('validates every target before any query and allows restart after complete stop', async () => {
    let calls = 0;
    const client = {
      query: async () => null,
      watcher: async () => {
        calls += 1;
        return null;
      },
    };
    const captured = capture();
    const bad = createPrometheusCollector({
      client,
      targets: [{ service: 'bad service', job: 'api' }],
    });
    expect(() => bad.start(captured.context)).toThrow('service');
    expect(calls).toBe(0);
    const collector = createPrometheusCollector({
      client,
      targets: [{ service: 'api', job: 'api' }],
    });
    collector.start(captured.context);
    await collector.stop();
    collector.start(captured.context);
    await collector.stop();
    expect(calls).toBe(4);
    expect(captured.envelopes).toHaveLength(0);
  });
});
