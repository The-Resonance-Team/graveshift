import { isISO8601 } from 'class-validator';
import { isValid, parseISO } from 'date-fns';

const WITH_TIMEZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d+))?(?:Z|[+-]\d{2}:\d{2})$/;

export function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = WITH_TIMEZONE.exec(value);
  if (match === null || !isISO8601(value, { strict: true, strictSeparator: true })) {
    return undefined;
  }
  // Parse whole seconds so millisecond rounding cannot advance a high-precision timestamp.
  const date = parseISO(value.replace(/\.\d+/, ''));
  if (!isValid(date)) return undefined;
  const utc = date.toISOString();
  if (!/^\d{4}-/.test(utc)) return undefined;
  // Changing the timezone must not truncate the Event envelope's fractional precision.
  return value.endsWith('Z') ? value : utc.replace(/\.\d{3}Z$/, `.${match[1] ?? '000'}Z`);
}

export function transformTimestampDate({
  obj,
  key,
}: {
  obj: Record<string, unknown>;
  key: string;
}) {
  // @Type runs first, so validate the original wire value rather than an already-coerced Date.
  const value = obj[key];
  if (value === undefined || value === null) return value;
  const timestamp = normalizeTimestamp(value);
  return timestamp === undefined
    ? new Date(Number.NaN)
    : parseISO(timestamp.replace(/(\.\d{3})\d+/, '$1'));
}
