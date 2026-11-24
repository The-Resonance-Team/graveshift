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

export { createHttpPublisher, type HttpPublisherOptions } from './http';

export { createNatsPublisher, type Publisher, type PublishTarget } from './publisher';

/** The one process port: the daemon receives decoded Events, never NATS messages. */
export {
  connectEventsConsumer,
  createEventsConsumer,
  decodeQueuedEvent,
  processQueued,
  type EventsConsumer,
  type EventsTransport,
  type QueuedEvent,
  type DeliveryOptions,
} from './consumer';
