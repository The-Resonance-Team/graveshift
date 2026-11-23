import {
  abortableSleep,
  type Clock,
  type Context,
  type Integration,
  type Sleep,
  envelopeBuilder,
  systemClock,
  validateContext,
} from '@graveshift/integrations';

import type { MetricsClient } from './client';

export interface MetricTarget {
  service: string;
  job: string;
}

export interface PrometheusOptions {
  client: MetricsClient;
  targets: readonly MetricTarget[];
  intervalMs?: number;
  clock?: Clock;
  sleep?: Sleep;
}

/** One schedule owns query time, cancellation and normalized metric observations. */
export function createPrometheusCollector(options: PrometheusOptions): Integration {
  const { client, clock = systemClock, sleep = abortableSleep, intervalMs = 15_000 } = options;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('Invalid metrics interval');
  const targets = options.targets.map((target) => ({ ...target }));
  let controller: AbortController | undefined;
  let running: Promise<void> | undefined;

  const observe = async (context: Context, signal: AbortSignal) => {
    await Promise.all(
      targets.map(async ({ service, job }) => {
        const observedAt = clock.now();
        const id = clock.newId();
        try {
          const samples = await Promise.allSettled([
            client.watcher('errorRate5xx', job, signal),
            client.watcher('p95LatencySeconds', job, signal),
          ]);
          if (signal.aborted) return;
          const [rate, latency] = samples;
          if (rate.status !== 'fulfilled' || latency.status !== 'fulfilled') return;
          const errorRate5xx = rate.value;
          const p95LatencySeconds = latency.value;
          const envelope = envelopeBuilder(
            { ...context, service },
            clock,
          )({
            id,
            observedAt,
            source: 'collector.prometheus',
            type: 'metric.sample',
            severity: 'info',
            traceId: id,
            fingerprint: `${service}:metric.sample`,
            payload: { job, errorRate5xx, p95LatencySeconds },
          });
          await context.publisher.publish(envelope);
        } catch {
          // Query and delivery failures affect this target and interval only.
        }
      }),
    );
  };

  return {
    name: 'prometheus',
    kind: 'collector',
    start(context) {
      validateContext(context);
      for (const target of targets) {
        validateContext({ ...context, service: target.service });
        if (!target.job) throw new Error('Metrics target needs a job');
      }
      if (running) throw new Error('Prometheus Collector is already active');
      controller = new AbortController();
      const { signal } = controller;
      const cycle = async (): Promise<void> => {
        if (!signal.aborted) {
          await observe(context, signal);
          if (!signal.aborted) {
            try {
              await sleep(intervalMs, signal);
            } catch {
              controller?.abort();
            }
          }
          if (!signal.aborted) return cycle();
        }
      };
      running = cycle();
      void running.catch(() => controller?.abort());
    },
    async stop() {
      const current = running;
      controller?.abort();
      try {
        await current;
      } finally {
        if (running === current) {
          running = undefined;
          controller = undefined;
        }
      }
    },
  };
}
