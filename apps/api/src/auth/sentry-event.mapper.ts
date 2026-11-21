import type { EventEnvelope } from '@graveshift/core';
import { redact } from '@graveshift/redactor';

import type { VerifiedCredential } from './auth.types';
import type { SentryEnvelopeHeader } from './sentry-envelope.parser';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function eventType(event: JsonObject): string {
  const exception = object(event.exception);
  const values = Array.isArray(exception?.values) ? exception.values : [];
  const firstException = object(values[0]);
  const raw = text(firstException?.type) ?? text(event.type) ?? 'event';
  // The exception type is untrusted event data, so redact it before shaping the type token.
  const cleaned = redact(raw)
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `sentry.${(cleaned || 'event').slice(0, 128)}`;
}

function severity(value: unknown): EventEnvelope['severity'] {
  if (value === 'fatal' || value === 'error') return 'critical';
  if (value === 'warning') return 'warning';
  return 'info';
}

function timestamp(value: unknown): string {
  const date =
    typeof value === 'number'
      ? new Date(value * 1000)
      : typeof value === 'string'
        ? new Date(value)
        : undefined;
  if (!date || Number.isNaN(date.getTime())) throw new TypeError('Event timestamp is invalid');
  return date.toISOString();
}

function traceId(event: JsonObject, id: string): string {
  const candidate = text(object(object(event.contexts)?.trace)?.trace_id);
  return candidate && /^[0-9a-f]{32}$/i.test(candidate) ? candidate.toLowerCase() : id;
}

function fingerprint(event: JsonObject, type: string): string {
  const supplied = event.fingerprint;
  if (typeof supplied === 'string' && supplied.length > 0) return supplied.slice(0, 512);
  if (Array.isArray(supplied) && supplied.length > 0) {
    const parts = supplied.filter(
      (part): part is string => typeof part === 'string' && part.length > 0,
    );
    if (parts.length > 0) return parts.join(':').slice(0, 512);
  }
  const exception = object(event.exception);
  const values = Array.isArray(exception?.values) ? exception.values : [];
  const firstException = object(values[0]);
  return [type, text(event.culprit) ?? '', text(event.message) ?? text(firstException?.value) ?? '']
    .join(':')
    .slice(0, 512);
}

export function isSentryEventId(value: string): boolean {
  return /^(?:[0-9a-f]{32}|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i.test(value);
}

export function mapSentryEvent(
  event: JsonObject,
  header: SentryEnvelopeHeader,
  credential: VerifiedCredential,
  fallbackId: string,
  fallbackTimestamp = new Date().toISOString(),
): EventEnvelope {
  const id = header.event_id ?? text(event.event_id) ?? fallbackId;
  if (!isSentryEventId(id)) throw new TypeError('Event id is invalid');
  const type = eventType(event);
  const exception = object(event.exception);
  const request = object(event.request);
  const payload = {
    ...(exception ? { exception } : {}),
    ...(text(event.message) ? { message: text(event.message) } : {}),
    ...(request ? { request } : {}),
  };

  return {
    id,
    tenantId: credential.tenantId,
    source: 'sentry',
    service: credential.service ?? '',
    type,
    severity: severity(event.level),
    observedAt: timestamp(event.timestamp ?? header.sent_at ?? fallbackTimestamp),
    traceId: traceId(event, id),
    fingerprint: fingerprint(event, type),
    payload,
  };
}

export function isJsonObject(value: unknown): value is JsonObject {
  return object(value) !== undefined;
}
