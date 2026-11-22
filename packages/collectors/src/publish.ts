import type { EventEnvelope, Signal } from '@graveshift/core';
import { type Clock, type Context, envelopeBuilder } from '@graveshift/integrations';
import { redact } from '@graveshift/redactor';

/** One observation read from the infrastructure. id and observedAt come from the source, never from the clock. */
export interface Observation {
  readonly id: string;
  readonly observedAt: string;
  readonly traceId: string;
  readonly source: string;
  readonly type: string;
  readonly severity: EventEnvelope['severity'];
  readonly fingerprint: string;
  readonly payload?: Record<string, unknown>;
}

/** Wait for ms or until the signal aborts, whichever comes first. */
export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

export const abortableSleep: Sleep = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/** Publish one observation as one envelope. It never throws. */
export type Observer = (observation: Observation) => void;

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : 'unknown error';

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item)]));
  }
  return value;
}

function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, redactValue(value)]),
  );
}

/**
 * Build one normalised envelope per observation and publish it. The envelope
 * id and observedAt come from the observation, so a replayed observation
 * rebuilds the same envelope and the publisher deduplicates it by msgID.
 * Fail open: a bad observation or a failing publisher calls warn and the
 * Collector loop keeps running.
 */
export function createObserver(context: Context, warn: (message: string) => void): Observer {
  return (observation) => {
    let envelope: EventEnvelope;
    try {
      const observationClock: Clock = {
        now: () => observation.observedAt,
        newId: () => observation.id,
      };
      envelope = envelopeBuilder(
        context,
        observationClock,
      )({
        source: observation.source,
        type: observation.type,
        severity: observation.severity,
        traceId: observation.traceId,
        fingerprint: observation.fingerprint,
        payload: redactPayload(observation.payload ?? {}),
      });
    } catch (error) {
      warn(`collector dropped observation ${observation.id}: ${reason(error)}`);
      return;
    }
    context.publisher.publish(envelope).catch((error: unknown) => {
      warn(`collector publish failed for envelope ${envelope.id}: ${reason(error)}`);
    });
  };
}

// Envelope types follow the rule vocabulary in packages/watcher (RULE_IDS) so one rule engine can match them.
// A Collector never evaluates a rule.
const SIGNAL_TYPES: Record<Signal['kind'], string> = {
  oom: 'runtime.oom',
  crash_loop: 'runtime.restart-loop',
  restart: 'runtime.restart',
  image_pull_backoff: 'k8s.image-pull',
  unhealthy: 'runtime.unhealthy',
};

/** Map one runtime Signal to an observation. The caller adds source and extra payload fields. */
export function signalObservation(
  source: string,
  signal: Signal,
  payload: Record<string, unknown>,
): Observation {
  return {
    id: signal.id,
    observedAt: signal.observedAt,
    traceId: signal.id,
    source,
    type: SIGNAL_TYPES[signal.kind],
    severity: signal.severity,
    fingerprint: signal.fingerprint,
    payload: { ...payload, message: signal.message },
  };
}
