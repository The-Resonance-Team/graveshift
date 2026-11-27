const BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 1.5, 2.5, 5, 10];

export function createMetrics() {
  const requests = new Map<string, number>();
  const buckets = BUCKETS.map(() => 0);
  let count = 0;
  let sum = 0;
  const gauges = new Map<string, number>();
  const counters = new Map<string, number>();

  return {
    observe(status: number, seconds: number) {
      const key = String(status);
      requests.set(key, (requests.get(key) ?? 0) + 1);
      count += 1;
      sum += seconds;
      BUCKETS.forEach((le, i) => {
        if (seconds <= le) buckets[i] = (buckets[i] ?? 0) + 1;
      });
    },
    inc(name: string) {
      counters.set(name, (counters.get(name) ?? 0) + 1);
    },
    gauge(name: string, value: number) {
      gauges.set(name, value);
    },
    render(): string {
      const lines = ['# TYPE http_requests_total counter'];
      for (const [status, n] of requests)
        lines.push(`http_requests_total{status="${status}"} ${n}`);
      lines.push('# TYPE http_request_duration_seconds histogram');
      BUCKETS.forEach((le, i) =>
        lines.push(`http_request_duration_seconds_bucket{le="${le}"} ${buckets[i]}`),
      );
      lines.push(`http_request_duration_seconds_bucket{le="+Inf"} ${count}`);
      lines.push(
        `http_request_duration_seconds_sum ${sum}`,
        `http_request_duration_seconds_count ${count}`,
      );
      lines.push('# TYPE process_resident_memory_bytes gauge');
      lines.push(`process_resident_memory_bytes ${process.memoryUsage.rss()}`);
      for (const [name, value] of gauges) lines.push(`${name} ${value}`);
      for (const [name, value] of counters)
        lines.push(`# TYPE ${name} counter`, `${name} ${value}`);
      return `${lines.join('\n')}\n`;
    },
  };
}
export type Metrics = ReturnType<typeof createMetrics>;
