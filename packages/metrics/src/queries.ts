const rate = '[1m]';
const label = (job: string): string => JSON.stringify(job);

// ponytail: queries are scoped by `job` only, upgrade if one job serves several services
export const WATCHER_QUERIES = {
  requestRate: (job: string) => `sum(rate(http_requests_total{job=${label(job)}}${rate}))`,
  errorRate5xx: (job: string) =>
    `sum(rate(http_requests_total{job=${label(job)},status=~"5.."}${rate})) / clamp_min(sum(rate(http_requests_total{job=${label(job)}}${rate})), 1e-9)`,
  p95LatencySeconds: (job: string) =>
    `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{job=${label(job)}}${rate})))`,
  up: (job: string) => `min(up{job=${label(job)}})`,
  residentMemoryBytes: (job: string) => `max(process_resident_memory_bytes{job=${label(job)}})`,
} as const;

export type WatcherQuery = keyof typeof WATCHER_QUERIES;
