import type { EventEnvelope } from '@graveshift/core';

import { publishSubject } from './subject';

export type { EventEnvelope } from '@graveshift/core';

export {
  DETECTION_FILTER_SUBJECT,
  EVENTS_SUBJECT_FILTER,
  SUBJECT_PREFIX,
  deadLetterSubject,
  laneFor,
  publishSubject,
  safeSubjectToken,
  type Lane,
} from './subject';

export {
  EVENTS_DUPLICATE_WINDOW_SECONDS,
  EVENTS_MAX_AGE_DAYS,
  EVENTS_MAX_BYTES,
  EVENTS_MAX_MSG_SIZE,
  EVENTS_MAX_MSGS,
  EVENTS_STREAM_NAME,
  GRAVESHIFT_EVENTS_STREAM,
  DETECTION_CONSUMER,
  createEnvelopeDeduplicator,
  type EnvelopeDeduplicator,
} from './streams';

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
