import { prepareEnvelope, type EventEnvelope } from '@graveshift/core';
import type { Publisher } from '@graveshift/events';

/** The runtime services a source may use. This module imports no NATS client. */
export interface Context {
  readonly publisher: Publisher;
  readonly projectId: string;
  readonly service: string;
}

/** A Plugin (in-process) or Collector (daemon-side) that publishes envelopes. */
export interface Integration {
  readonly name: string;
  readonly kind: 'plugin' | 'collector';
  start(context: Context): void | Promise<void>;
  stop(): void | Promise<void>;
}

/** The event-specific fields a caller supplies to the envelope helper. */
export interface EventDetails {
  readonly id?: string;
  readonly observedAt?: string;
  readonly source: string;
  readonly type: string;
  readonly severity: EventEnvelope['severity'];
  readonly traceId: string;
  readonly fingerprint: string;
  readonly payload?: Record<string, unknown>;
}

/** Injected time and id source. Tests use a fixed clock for deterministic envelopes. */
export interface Clock {
  now(): string;
  newId(): string;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
};

const subjectToken = /^[A-Za-z0-9_-]+$/;

/**
 * Fail fast on a bad host wiring. Call this once at start, not per request.
 * The checks match the projectId and service rules of EventEnvelopeSchema.
 */
export function validateContext(context: unknown): asserts context is Context {
  if (!context || typeof context !== 'object') {
    throw new Error('Graveshift context must be an object');
  }
  if (
    !('publisher' in context) ||
    !context.publisher ||
    typeof context.publisher !== 'object' ||
    !('publish' in context.publisher) ||
    typeof context.publisher.publish !== 'function'
  ) {
    throw new Error('Graveshift context needs a publisher with publish()');
  }
  if (
    !('projectId' in context) ||
    typeof context.projectId !== 'string' ||
    !subjectToken.test(context.projectId)
  ) {
    throw new Error('Graveshift context needs a valid projectId');
  }
  if (
    !('service' in context) ||
    typeof context.service !== 'string' ||
    !subjectToken.test(context.service)
  ) {
    throw new Error('Graveshift context needs a valid service');
  }
  prepareEnvelope({
    id: 'context-check',
    projectId: context.projectId,
    service: context.service,
    source: 'integration',
    type: 'integration.context',
    severity: 'info',
    observedAt: '2026-11-20T10:00:00.000Z',
    traceId: 'context-check',
    fingerprint: 'context-check',
    payload: {},
  });
}

/**
 * Build a function that prepares envelopes under the core privacy rules. The
 * context supplies project and service; the clock supplies time and idempotency
 * key. No I/O happens here.
 */
export function envelopeBuilder(context: Context, clock: Clock = systemClock) {
  return (details: EventDetails): EventEnvelope =>
    prepareEnvelope({
      id: details.id ?? clock.newId(),
      projectId: context.projectId,
      source: details.source,
      service: context.service,
      type: details.type,
      severity: details.severity,
      observedAt: details.observedAt ?? clock.now(),
      traceId: details.traceId,
      fingerprint: details.fingerprint,
      payload: details.payload ?? {},
    });
}

export { abortableSleep, backoffMs, startWatchLoop } from './watch';
export type { Sleep, WatchNotice } from './watch';
export type { CollectorReads, GraveHealth, GraveInfo } from './reads';
export { createDeliveryQueue } from './delivery';
