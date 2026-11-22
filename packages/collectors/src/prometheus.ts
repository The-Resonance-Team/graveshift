import { createMetricsClient, type MetricsClient, type WatcherQuery } from '@graveshift/metrics';
import {
  type Clock,
  type Integration,
  systemClock,
  validateContext,
} from '@graveshift/integrations';

import {
  abortableSleep,
  createObserver,
  type Observation,
  type Observer,
  type Sleep,
} from './publish';

export interface PrometheusCollectorOptions {
  /** Injected in tests. When omitted, the Collector builds one from baseUrl. */
  client?: MetricsClient;
  /** Prometheus base URL, used only when no client is injected. */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: Sleep;
  /** Limits the poll to these watcher queries. Defaults to all five. */
  queries?: readonly WatcherQuery[];
  clock?: Clock;
  warn?: (message: string) => void;
}

/** A Collector that also exposes one poll cycle for tests and manual runs. */
export interface PrometheusCollector extends Integration {
  /** Run one poll cycle against the Prometheus server. A no-op before start and after stop. */
  pollOnce(): Promise<void>;
}

// Envelope types follow the rule vocabulary in packages/watcher (RULE_IDS) so one rule engine can match them.
// A Collector never evaluates a rule.
const METRIC_TYPES: Record<WatcherQuery, string> = {
  requestRate: 'metric.request-rate',
  errorRate5xx: 'metric.5xx-rate',
  p95LatencySeconds: 'metric.p95-latency',
  up: 'metric.up',
  residentMemoryBytes: 'metric.resident-memory-bytes',
};

const DEFAULT_QUERIES: readonly WatcherQuery[] = [
  'up',
  'requestRate',
  'errorRate5xx',
  'p95LatencySeconds',
  'residentMemoryBytes',
];

const DEFAULT_INTERVAL_MS = 15_000;
const SOURCE = 'collector.prometheus';

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : 'unknown error';

/**
 * Poll Prometheus for the Grave named in Context.service and publish one
 * info envelope per numeric sample. info events feed baselines and charts;
 * the daemon rule engine decides what to detect. Fail closed at start on a
 * bad context or a second start; fail open on every publish. Call stop()
 * before starting again.
 */
export function createPrometheusCollector(
  options: PrometheusCollectorOptions,
): PrometheusCollector {
  const warn = options.warn ?? (() => {});
  const clock = options.clock ?? systemClock;
  const sleep = options.sleep ?? abortableSleep;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const queries = options.queries ?? DEFAULT_QUERIES;

  let client: MetricsClient | undefined;
  let observer: Observer | undefined;
  let grave: string | undefined;
  let controller: AbortController | undefined;
  let running = false;

  const pollCycle = async (): Promise<void> => {
    const activeClient = client;
    const activeObserver = observer;
    const target = grave;
    if (!activeClient || !activeObserver || !target) return;
    const traceId = clock.newId();
    // one failed query must not stop the cycle; queries run concurrently
    const observations = await Promise.all(
      queries.map(async (query): Promise<Observation | undefined> => {
        try {
          const value = await activeClient.watcher(query, target);
          if (value === null) return undefined;
          return {
            id: `prometheus:${target}:${query}:${traceId}`,
            observedAt: clock.now(),
            traceId,
            source: SOURCE,
            type: METRIC_TYPES[query],
            severity: 'info',
            fingerprint: `${target}:${METRIC_TYPES[query]}`,
            payload: { query, value },
          };
        } catch (error) {
          warn(`prometheus query ${query} failed for ${target}: ${reason(error)}`);
          return undefined;
        }
      }),
    );
    for (const observation of observations) if (observation) activeObserver(observation);
  };

  return {
    name: 'prometheus-collector',
    kind: 'collector',

    pollOnce: () => pollCycle(),

    async start(context) {
      validateContext(context);
      // one live cycle chain: a second start leaks the first unless stop() ran first
      if (running) throw new Error('prometheus collector is already started');
      if (options.client) client = options.client;
      else if (options.baseUrl)
        client = createMetricsClient(options.baseUrl, options.fetch, options.timeoutMs);
      else throw new Error('prometheus collector needs a client or a baseUrl');
      running = true;
      observer = createObserver(context, warn);
      grave = context.service;
      await pollCycle();
      controller = new AbortController();
      const { signal } = controller;
      // recursion, not a loop: each cycle starts only after the previous one ends
      const runCycle = async (): Promise<void> => {
        await sleep(intervalMs, signal);
        if (signal.aborted) return;
        try {
          await pollCycle();
        } catch (error) {
          // the cycle chain keeps running: a failed cycle is reported, never thrown
          warn(`prometheus poll cycle failed: ${reason(error)}`);
        }
        void runCycle();
      };
      void runCycle();
    },

    async stop() {
      controller?.abort();
      controller = undefined;
      observer = undefined;
      client = undefined;
      grave = undefined;
      running = false;
    },
  };
}
