import type { EventEnvelope } from '@graveshift/core';

/** The prefix of every Graveshift event subject. */
export const SUBJECT_PREFIX = 'graveshift';

/** The filter of the one event stream. It spans both lanes and all tenants. */
export const EVENTS_SUBJECT_FILTER = `${SUBJECT_PREFIX}.>`;

/** The filter a per-Grave detection consumer uses. */
export const DETECTION_FILTER_SUBJECT = `${SUBJECT_PREFIX}.*.detection.>`;

const safeToken = /^[A-Za-z0-9_-]+$/;

/**
 * Map a service name to one safe NATS subject token. A service that already
 * holds a safe token is unchanged; other characters collapse to an underscore.
 * // ponytail: one-token replacement, upgrade if two services collide on one token
 */
export function safeSubjectToken(service: string): string {
  if (safeToken.test(service)) return service;
  const mapped = service.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return mapped.length > 0 ? mapped : '_';
}

export type Lane = 'telemetry' | 'detection';

export function laneFor(severity: EventEnvelope['severity']): Lane {
  return severity === 'info' ? 'telemetry' : 'detection';
}

/** Build `graveshift.<tenantId>.<lane>.<grave>.<type>`. */
export function publishSubject(envelope: EventEnvelope): string {
  const grave = safeSubjectToken(envelope.service);
  return `${SUBJECT_PREFIX}.${envelope.tenantId}.${laneFor(envelope.severity)}.${grave}.${envelope.type}`;
}

/** Build the dead-letter subject for an exhausted detection envelope. */
export function deadLetterSubject(tenantId: string, grave: string): string {
  return `${SUBJECT_PREFIX}.${tenantId}.dlq.${safeSubjectToken(grave)}`;
}
