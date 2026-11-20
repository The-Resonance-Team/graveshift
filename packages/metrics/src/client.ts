import { GraveshiftError } from '@graveshift/core';
import { z } from 'zod';

import { WATCHER_QUERIES, type WatcherQuery } from './queries';

export class MetricsError extends GraveshiftError<'METRICS_QUERY_FAILED'> {
  constructor(message: string) {
    super('METRICS_QUERY_FAILED', message);
  }
}

const ResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    data: z.object({
      result: z.array(z.object({ value: z.tuple([z.number(), z.string()]) })),
    }),
  }),
  z.object({ status: z.literal('error'), error: z.string() }),
]);

export interface MetricsClient {
  query(promql: string): Promise<number | null>;
  watcher(name: WatcherQuery, job: string): Promise<number | null>;
}

export function createMetricsClient(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 5000,
): MetricsClient {
  const query = async (promql: string): Promise<number | null> => {
    const url = new URL('/api/v1/query', baseUrl);
    url.searchParams.set('query', promql);
    const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new MetricsError(`prometheus responded ${res.status}`);
    const body = ResponseSchema.safeParse(await res.json());
    if (!body.success) throw new MetricsError('unexpected prometheus response');
    if (body.data.status === 'error') throw new MetricsError(body.data.error);
    const sample = body.data.data.result[0];
    if (!sample) return null;
    const value = Number(sample.value[1]);
    return Number.isNaN(value) ? null : value;
  };
  return { query, watcher: (name, job) => query(WATCHER_QUERIES[name](job)) };
}
