import type { MetricsClient } from '@graveshift/metrics';

import type { Watcher } from './watcher';

export interface PollTarget {
  service: string;
  job: string;
}

export interface PollerOptions {
  client: MetricsClient;
  watcher: Watcher;
  targets: PollTarget[];
  intervalMs?: number;
  now?: () => Date;
  warn?: (message: string) => void;
}

export function createPoller({
  client,
  watcher,
  targets,
  intervalMs = 15_000,
  now = () => new Date(),
  warn = () => {},
}: PollerOptions) {
  // a failed query logs a warning and skips this interval for that target, it never throws
  const pollOnce = async (): Promise<void> => {
    await Promise.all(
      targets.map(async ({ service, job }) => {
        try {
          const [errorRate5xx, p95LatencySeconds] = await Promise.all([
            client.watcher('errorRate5xx', job),
            client.watcher('p95LatencySeconds', job),
          ]);
          watcher.metrics(service, { errorRate5xx, p95LatencySeconds }, now().toISOString());
        } catch (error) {
          warn(
            `promql poll failed for ${service}: ${error instanceof Error ? error.message : 'unknown'}`,
          );
        }
      }),
    );
  };

  return {
    pollOnce,
    start(): () => void {
      const timer = setInterval(() => void pollOnce(), intervalMs);
      return () => clearInterval(timer);
    },
  };
}
