import { z } from 'zod';

// Identifiers a query may use: the metrics and functions the watcher already relies on.
const ALLOWED = new Set([
  'http_requests_total',
  'http_request_duration_seconds_bucket',
  'process_resident_memory_bytes',
  'up',
  'sum',
  'min',
  'max',
  'avg',
  'rate',
  'increase',
  'histogram_quantile',
  'clamp_min',
  'by',
  'le',
  'job',
  'status',
  'service',
]);
const MAX_RANGE_MINUTES = 60;
const UNIT_MINUTES: Record<string, number> = { s: 1 / 60, m: 1, h: 60 };

export function checkPromql(query: string): string | undefined {
  const ranges = [...query.matchAll(/\[(\d+)([smh])\]/g)];
  for (const [, n, unit] of ranges) {
    if (Number(n) * (UNIT_MINUTES[unit ?? ''] ?? Infinity) > MAX_RANGE_MINUTES)
      return `range exceeds ${MAX_RANGE_MINUTES}m`;
  }
  const bare = query
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/\[\d+[smh]\]/g, '')
    .replace(/\b\d+(?:\.\d+)?(?:e-?\d+)?\b/g, '');
  if (/[@`;]|\boffset\b/.test(bare)) return 'forbidden syntax';
  for (const word of bare.match(/[A-Za-z_][A-Za-z0-9_:]*/g) ?? []) {
    if (!ALLOWED.has(word)) return `identifier not allowed: ${word}`;
  }
  return undefined;
}

export const PromqlSchema = z
  .string()
  .min(1)
  .max(300)
  .superRefine((value, ctx) => {
    const problem = checkPromql(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });
