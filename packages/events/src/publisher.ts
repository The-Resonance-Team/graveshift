import { prepareEnvelope, type EventEnvelope } from '@graveshift/core';

import { publishSubject } from './subject';

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

/** Publish each envelope to JetStream with its id as the deduplication key. */
export function createNatsPublisher(js: PublishTarget): Publisher {
  return {
    async publish(envelope) {
      const prepared = prepareEnvelope(envelope);
      const payload = new TextEncoder().encode(JSON.stringify(prepared));
      await js.publish(publishSubject(prepared), payload, { msgID: prepared.id });
    },
  };
}
