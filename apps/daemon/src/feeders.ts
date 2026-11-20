import type { RuntimeSource } from '@graveshift/core';
import type { Watcher } from '@graveshift/watcher';

export interface FeederOptions {
  source: RuntimeSource;
  watcher: Watcher;
  services: () => Promise<string[]>;
  logPollMs: number;
  healthPollMs: number;
  now?: () => Date;
  warn?: (message: string) => void;
}

// tailLogs has no timestamps, so new lines are found by diffing against the previous tail
export function newLines(previous: string[], current: string[]): string[] {
  for (let overlap = Math.min(previous.length, current.length); overlap > 0; overlap--) {
    const tail = previous.slice(-overlap);
    if (tail.every((line, i) => current[i] === line)) return current.slice(overlap);
  }
  return current;
}

// ponytail: logs and health are polled, upgrade to streaming logs if the 5 s poll misses a burst
export function startFeeders({
  source,
  watcher,
  services,
  logPollMs,
  healthPollMs,
  now = () => new Date(),
  warn = () => {},
}: FeederOptions): () => void {
  const lastTail = new Map<string, string[]>();
  const pollLogs = async () => {
    const list = await services().catch(() => []);
    await Promise.all(
      list.map(async (service) => {
        try {
          const lines = await source.tailLogs(service, 200);
          const previous = lastTail.get(service);
          lastTail.set(service, lines);
          if (!previous) return;
          const at = now().toISOString();
          for (const line of newLines(previous, lines)) watcher.log(service, line, at);
        } catch (error) {
          warn(
            `log poll failed for ${service}: ${error instanceof Error ? error.message : 'unknown'}`,
          );
        }
      }),
    );
  };
  const pollHealth = async () => {
    const list = await services().catch(() => []);
    await Promise.all(
      list.map(async (service) => {
        const health = await source.getHealth(service).catch(() => undefined);
        if (health && health.status !== 'unknown') {
          watcher.healthCheck(service, health.status !== 'unhealthy', now().toISOString());
        }
      }),
    );
  };
  const timers = [
    setInterval(() => void pollLogs(), logPollMs),
    setInterval(() => void pollHealth(), healthPollMs),
  ];
  void pollLogs();
  return () => {
    for (const timer of timers) clearInterval(timer);
  };
}
