import type { EventEnvelope } from '@graveshift/core';
import { connect, type NatsConnection } from 'nats';

export interface Publisher {
  publish(envelope: EventEnvelope): Promise<void>;
}

/**
 * The part of a NATS JetStream client that the publisher uses. A real client
 * from `nc.jetstream()` satisfies this shape, and tests can supply a fake.
 */
export interface PublishTarget {
  publish(subject: string, payload: Uint8Array, options: { msgID: string }): Promise<unknown>;
}

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

export interface NatsPublisherHandle {
  publisher: Publisher;
  close(): Promise<void>;
}

/** Connect with the official NATS client and return a JetStream publisher. */
export async function connectNatsPublisher(
  servers: string | string[],
): Promise<NatsPublisherHandle> {
  const nc: NatsConnection = await connect({ servers });
  return {
    publisher: createNatsPublisher(nc.jetstream()),
    close: () => nc.close(),
  };
}

export interface InMemoryPublisher extends Publisher {
  readonly envelopes: EventEnvelope[];
}

/** Captures envelopes in memory for tests. No NATS server is used. */
export function createInMemoryPublisher(): InMemoryPublisher {
  const envelopes: EventEnvelope[] = [];
  return {
    envelopes,
    async publish(envelope) {
      envelopes.push(envelope);
    },
  };
}
