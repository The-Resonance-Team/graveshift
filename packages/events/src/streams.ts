import { DETECTION_FILTER_SUBJECT, EVENTS_SUBJECT_FILTER } from './subject';

/** The one name for the event stream. Every config place must use this value. */
export const EVENTS_STREAM_NAME = 'GRAVESHIFT_EVENTS';

const NANOS_PER_SECOND = 1_000_000_000;

export const EVENTS_MAX_AGE_DAYS = 30;
export const EVENTS_MAX_MSGS = 5_000_000;
export const EVENTS_MAX_BYTES = 10 * 1024 * 1024 * 1024;
export const EVENTS_MAX_MSG_SIZE = 128 * 1024;
export const EVENTS_DUPLICATE_WINDOW_SECONDS = 120;

/**
 * The one stream definition. Keys and duration units match the NATS JetStream
 * stream config so a declarative config can be checked against it.
 */
export const GRAVESHIFT_EVENTS_STREAM = {
  name: EVENTS_STREAM_NAME,
  subjects: [EVENTS_SUBJECT_FILTER],
  storage: 'file',
  retention: 'limits',
  discard: 'old',
  num_replicas: 1,
  allow_direct: true,
  max_age: EVENTS_MAX_AGE_DAYS * 24 * 60 * 60 * NANOS_PER_SECOND,
  max_msgs: EVENTS_MAX_MSGS,
  max_bytes: EVENTS_MAX_BYTES,
  max_msg_size: EVENTS_MAX_MSG_SIZE,
  duplicate_window: EVENTS_DUPLICATE_WINDOW_SECONDS * NANOS_PER_SECOND,
} as const;

/** The one durable consumer definition for the detection lane. */
export const DETECTION_CONSUMER = {
  durable_name: 'graveshift-watcher',
  filter_subject: DETECTION_FILTER_SUBJECT,
  ack_policy: 'explicit',
  ack_wait: 30 * NANOS_PER_SECOND,
  max_deliver: 5,
  backoff: [1 * NANOS_PER_SECOND, 5 * NANOS_PER_SECOND, 30 * NANOS_PER_SECOND],
  deliver_policy: 'all',
} as const;

/** Reports whether an envelope id was already delivered; records new ids. */
export interface EnvelopeDeduplicator {
  isDuplicate(id: string): boolean;
}

/**
 * Deduplicate consumer deliveries by envelope id. Delivery is at least once,
 * so a replay after the duplicate window must not be handled twice.
 */
export function createEnvelopeDeduplicator(maxSize = 100_000): EnvelopeDeduplicator {
  const seen = new Set<string>();
  return {
    isDuplicate(id) {
      if (seen.has(id)) return true;
      seen.add(id);
      if (seen.size > maxSize) {
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      return false;
    },
  };
}
