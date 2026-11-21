import { EventEnvelopeSchema, type EventEnvelope } from '@graveshift/core';
import type { Publisher } from '@graveshift/events';

/** The runtime services a source may use. This module imports no NATS client. */
export interface Context {
  readonly publisher: Publisher;
  readonly tenantId: string;
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
 * The checks match the tenantId and service rules of EventEnvelopeSchema.
 */
export function validateContext(context: Context): void {
  if (!context || typeof context !== 'object') {
    throw new Error('Graveshift context must be an object');
  }
  if (typeof context.publisher?.publish !== 'function') {
    throw new Error('Graveshift context needs a publisher with publish()');
  }
  if (typeof context.tenantId !== 'string' || !subjectToken.test(context.tenantId)) {
    throw new Error('Graveshift context needs a valid tenantId');
  }
  if (typeof context.service !== 'string' || !subjectToken.test(context.service)) {
    throw new Error('Graveshift context needs a valid service');
  }
}

/**
 * Build a function that creates envelopes valid under the core schema. The
 * context supplies tenant and service; the clock supplies time and idempotency
 * key. No I/O happens here.
 */
export function envelopeBuilder(context: Context, clock: Clock = systemClock) {
  return (details: EventDetails): EventEnvelope =>
    EventEnvelopeSchema.parse({
      id: clock.newId(),
      tenantId: context.tenantId,
      source: details.source,
      service: context.service,
      type: details.type,
      severity: details.severity,
      observedAt: clock.now(),
      traceId: details.traceId,
      fingerprint: details.fingerprint,
      payload: details.payload ?? {},
    });
}
