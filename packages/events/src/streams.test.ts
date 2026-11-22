import { describe, expect, test } from 'bun:test';

import {
  DETECTION_CONSUMER,
  DETECTION_FILTER_SUBJECT,
  EVENTS_DUPLICATE_WINDOW_SECONDS,
  EVENTS_MAX_AGE_DAYS,
  EVENTS_MAX_BYTES,
  EVENTS_MAX_MSG_SIZE,
  EVENTS_MAX_MSGS,
  EVENTS_STREAM_NAME,
  EVENTS_SUBJECT_FILTER,
  GRAVESHIFT_EVENTS_STREAM,
  createEnvelopeDeduplicator,
  deadLetterSubject,
} from './index';

describe('event stream definition', () => {
  test('uses one stream name and the graveshift.> filter', () => {
    expect(EVENTS_STREAM_NAME).toBe('GRAVESHIFT_EVENTS');
    expect(EVENTS_SUBJECT_FILTER).toBe('graveshift.>');
    expect(GRAVESHIFT_EVENTS_STREAM.name).toBe(EVENTS_STREAM_NAME);
    expect(GRAVESHIFT_EVENTS_STREAM.subjects).toEqual([EVENTS_SUBJECT_FILTER]);
  });

  test('uses file storage and limits retention with discard old', () => {
    expect(GRAVESHIFT_EVENTS_STREAM.storage).toBe('file');
    expect(GRAVESHIFT_EVENTS_STREAM.retention).toBe('limits');
    expect(GRAVESHIFT_EVENTS_STREAM.discard).toBe('old');
    expect(GRAVESHIFT_EVENTS_STREAM.num_replicas).toBe(1);
    expect(GRAVESHIFT_EVENTS_STREAM.allow_direct).toBe(true);
  });

  test('matches the age, count, size and message limits in the report', () => {
    expect(EVENTS_MAX_AGE_DAYS).toBe(30);
    expect(GRAVESHIFT_EVENTS_STREAM.max_age).toBe(30 * 24 * 60 * 60 * 1_000_000_000);
    expect(EVENTS_MAX_MSGS).toBe(5_000_000);
    expect(GRAVESHIFT_EVENTS_STREAM.max_msgs).toBe(EVENTS_MAX_MSGS);
    expect(EVENTS_MAX_BYTES).toBe(10 * 1024 * 1024 * 1024);
    expect(GRAVESHIFT_EVENTS_STREAM.max_bytes).toBe(EVENTS_MAX_BYTES);
    expect(EVENTS_MAX_MSG_SIZE).toBe(128 * 1024);
    expect(GRAVESHIFT_EVENTS_STREAM.max_msg_size).toBe(EVENTS_MAX_MSG_SIZE);
  });

  test('keeps a two-minute duplicate window', () => {
    expect(EVENTS_DUPLICATE_WINDOW_SECONDS).toBe(120);
    expect(GRAVESHIFT_EVENTS_STREAM.duplicate_window).toBe(120 * 1_000_000_000);
  });

  test('keeps a 128 KiB server payload limit', () => {
    expect(GRAVESHIFT_EVENTS_STREAM.max_msg_size).toBe(131_072);
  });
});

describe('detection consumer', () => {
  test('is durable, filtered to detection and replaying retained messages', () => {
    expect(DETECTION_CONSUMER.durable_name).toBe('graveshift-watcher');
    expect(DETECTION_CONSUMER.filter_subject).toBe('graveshift.*.detection.>');
    expect(DETECTION_FILTER_SUBJECT).toBe(DETECTION_CONSUMER.filter_subject);
    expect(DETECTION_CONSUMER.deliver_policy).toBe('all');
  });

  test('uses explicit ack, 30s wait, five deliveries and bounded backoff', () => {
    expect(DETECTION_CONSUMER.ack_policy).toBe('explicit');
    expect(DETECTION_CONSUMER.ack_wait).toBe(30 * 1_000_000_000);
    expect(DETECTION_CONSUMER.max_deliver).toBe(5);
    expect(DETECTION_CONSUMER.backoff).toEqual([1_000_000_000, 5_000_000_000, 30_000_000_000]);
  });
});

describe('dead-letter subject', () => {
  test('uses the tenant and the safe Grave token', () => {
    expect(deadLetterSubject('acme', 'checkout')).toBe('graveshift.acme.dlq.checkout');
    expect(deadLetterSubject('acme', 'checkout.api')).toBe('graveshift.acme.dlq.checkout_api');
  });

  test('does not match the detection consumer filter', () => {
    const filter = DETECTION_CONSUMER.filter_subject;
    const parts = filter.split('.');
    const dlq = deadLetterSubject('acme', 'checkout').split('.');
    expect(parts[2]).toBe('detection');
    expect(dlq[2]).toBe('dlq');
  });
});

describe('createEnvelopeDeduplicator', () => {
  test('deduplicates by envelope id', () => {
    const dedupe = createEnvelopeDeduplicator();
    expect(dedupe.isDuplicate('evt-1')).toBe(false);
    expect(dedupe.isDuplicate('evt-1')).toBe(true);
    expect(dedupe.isDuplicate('evt-2')).toBe(false);
    expect(dedupe.isDuplicate('evt-2')).toBe(true);
  });

  test('bounds memory by evicting the oldest id', () => {
    const dedupe = createEnvelopeDeduplicator(2);
    expect(dedupe.isDuplicate('a')).toBe(false);
    expect(dedupe.isDuplicate('b')).toBe(false);
    expect(dedupe.isDuplicate('c')).toBe(false);
    expect(dedupe.isDuplicate('a')).toBe(false);
  });
});
