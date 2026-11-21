import type { EventEnvelope } from '@graveshift/core';

export type { EventEnvelope } from '@graveshift/core';

export interface Publisher {
  publish(envelope: EventEnvelope): Promise<void>;
}

/**
 * The part of a NATS JetStream client that the publisher uses. A real client
 * from `jetstream(nc)` satisfies this shape, and tests can supply a fake.
 */
export interface PublishTarget {
  publish(subject: string, payload: Uint8Array, options: { msgID: string }): Promise<unknown>;
}

export { createHttpPublisher, type HttpPublisherOptions } from './http';

export type Lane = 'telemetry' | 'detection';

export function laneFor(severity: EventEnvelope['severity']): Lane {
  return severity === 'info' ? 'telemetry' : 'detection';
}

export function publishSubject(envelope: EventEnvelope): string {
  return `graveshift.${envelope.tenantId}.${laneFor(envelope.severity)}.${envelope.type}`;
}

/** Publish each envelope to JetStream with its id as the deduplication key. */
export function createNatsPublisher(js: PublishTarget): Publisher {
  return {
    publish(envelope) {
      const payload = new TextEncoder().encode(JSON.stringify(envelope));
      return js
        .publish(publishSubject(envelope), payload, { msgID: envelope.id })
        .then(() => undefined);
    },
  };
}
