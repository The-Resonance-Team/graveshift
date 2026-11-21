import { readSentryEnvelopeHeader } from './sentry-envelope.parser';

export interface SentryAuthRequest {
  headers?: { authorization?: string };
  query?: { sentry_key?: string | string[] };
  body?: unknown;
}

export interface SentryKeyCandidates {
  keys: string[];
  invalidDsn: boolean;
}

function keyFromDsn(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return decodeURIComponent(url.username) || undefined;
  } catch {
    return undefined;
  }
}

export function sentryKeyCandidates(request: SentryAuthRequest): SentryKeyCandidates {
  const keys: string[] = [];
  const query = request.query?.sentry_key;
  if (typeof query === 'string') keys.push(query);
  if (Array.isArray(query)) keys.push(...query);

  const authorization = request.headers?.authorization ?? '';
  const match = /^Sentry ([^\s]+)$/.exec(authorization);
  if (match?.[1]) keys.push(match[1]);

  if (Buffer.isBuffer(request.body)) {
    try {
      const dsn = readSentryEnvelopeHeader(request.body).dsn;
      if (dsn !== undefined) {
        const key = keyFromDsn(dsn);
        if (key) keys.push(key);
        else return { keys, invalidDsn: true };
      }
    } catch {
      // Malformed envelopes are rejected by the ingest service after key auth.
    }
  }

  return { keys, invalidDsn: false };
}
