import { redact } from '@graveshift/redactor';

/** Redact every string, including object keys, before a reply leaves the process. */
export function deepRedact<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as T;
  if (Array.isArray(value)) return value.map((item) => deepRedact(item)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [redact(key), deepRedact(item)]),
    ) as T;
  }
  return value;
}
