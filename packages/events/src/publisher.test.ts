import {
  EnvelopeError,
  type EventEnvelope,
  EventEnvelopeSchema,
  prepareEnvelope,
} from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import { createNatsPublisher, type PublishTarget, publishSubject, safeSubjectToken } from './index';
import { createInMemoryPublisher } from './testing';

const envelope: EventEnvelope = {
  id: 'evt-1',
  projectId: 'project-1',
  source: 'collector.docker',
  service: 'api',
  type: 'signal.oom',
  severity: 'info',
  observedAt: '2026-11-20T10:00:00.000Z',
  traceId: 'trace-1',
  fingerprint: 'api:oom',
  payload: { restarts: 3 },
};

interface Published {
  subject: string;
  payload: Uint8Array;
  options: { msgID: string };
}

function fakeTarget(failure?: Error): { target: PublishTarget; published: Published[] } {
  const published: Published[] = [];
  return {
    published,
    target: {
      publish(subject, payload, options) {
        if (failure) return Promise.reject(failure);
        published.push({ subject, payload, options });
        return Promise.resolve(undefined);
      },
    },
  };
}

describe('publish subject', () => {
  test('info uses the telemetry lane and includes the Grave token', () => {
    expect(publishSubject(envelope)).toBe('graveshift.project-1.telemetry.api.signal.oom');
  });

  for (const severity of ['warning', 'critical'] as const) {
    test(`${severity} uses the detection lane and includes the Grave token`, () => {
      expect(publishSubject({ ...envelope, severity })).toBe(
        `graveshift.project-1.detection.api.signal.oom`,
      );
    });
  }

  test('maps a service with unsafe characters to one safe token', () => {
    expect(publishSubject({ ...envelope, service: 'checkout.api/v2' })).toBe(
      'graveshift.project-1.telemetry.checkout_api_v2.signal.oom',
    );
  });

  test('safeSubjectToken is idempotent and never empty', () => {
    expect(safeSubjectToken('checkout')).toBe('checkout');
    expect(safeSubjectToken('checkout.api')).toBe('checkout_api');
    expect(safeSubjectToken('...')).toBe('_');
    expect(safeSubjectToken(safeSubjectToken('a b'))).toBe(safeSubjectToken('a b'));
  });
});

describe('subject part safety', () => {
  test('publishSubject rejects an unsafe projectId', () => {
    for (const projectId of ['a.b', 'a*b', 'a>b', 'a b', '']) {
      expect(() => publishSubject({ ...envelope, projectId })).toThrow('projectId');
    }
  });

  test('publishSubject rejects a wildcard or empty token in type', () => {
    for (const type of ['signal.*', 'signal.>', 'signal..oom', '.oom', 'signal ']) {
      expect(() => publishSubject({ ...envelope, type })).toThrow('type');
    }
    expect(publishSubject({ ...envelope, type: 'checkout.http.request' })).toBe(
      'graveshift.project-1.telemetry.api.checkout.http.request',
    );
  });

  test('the core schema already limits projectId and type', () => {
    for (const projectId of ['a.b', 'a*b', 'a>b']) {
      expect(() => EventEnvelopeSchema.parse({ ...envelope, projectId })).toThrow();
    }
    for (const type of ['signal.*', 'signal.>']) {
      expect(() => EventEnvelopeSchema.parse({ ...envelope, type })).toThrow();
    }
    expect(() => EventEnvelopeSchema.parse({ ...envelope, type: 'a.b.c' })).not.toThrow();
  });
});

describe('createNatsPublisher', () => {
  test('propagates the envelope id as the idempotency key', async () => {
    const { target, published } = fakeTarget();
    await createNatsPublisher(target).publish(envelope);

    expect(published).toHaveLength(1);
    expect(published[0]?.options.msgID).toBe(envelope.id);
  });

  test('reuses the same msgID for the same envelope id', async () => {
    const { target, published } = fakeTarget();
    const publisher = createNatsPublisher(target);

    await publisher.publish(envelope);
    await publisher.publish(envelope);

    expect(published.map((record) => record.options.msgID)).toEqual([envelope.id, envelope.id]);
  });

  test('keeps two real UUIDs distinct through preparation, serialization and redelivery', async () => {
    const traceId = crypto.randomUUID();
    const fingerprint = crypto.randomUUID();
    const first = prepareEnvelope({ ...envelope, id: crypto.randomUUID(), traceId, fingerprint });
    const second = prepareEnvelope({ ...envelope, id: crypto.randomUUID(), traceId, fingerprint });
    const { target, published } = fakeTarget();
    const publisher = createNatsPublisher(target);
    await publisher.publish(first);
    await publisher.publish(second);
    await publisher.publish(first);

    const decoded = published.map((record) =>
      EventEnvelopeSchema.parse(JSON.parse(new TextDecoder().decode(record.payload))),
    );
    expect(first.id).not.toBe(second.id);
    expect(decoded).toEqual([first, second, first]);
    expect(published.map((record) => record.options.msgID)).toEqual([
      first.id,
      second.id,
      first.id,
    ]);
    expect(decoded.map((item) => item.traceId)).toEqual([traceId, traceId, traceId]);
    expect(decoded.map((item) => item.fingerprint)).toEqual([
      fingerprint,
      fingerprint,
      fingerprint,
    ]);
  });

  test('a retry after a failed acknowledgement reuses the same msgID and bytes', async () => {
    const attempts: Published[] = [];
    const failure = new Error('acknowledgement lost');
    const publisher = createNatsPublisher({
      async publish(subject, payload, options) {
        attempts.push({ subject, payload, options });
        if (attempts.length === 1) throw failure;
      },
    });
    const input = { ...envelope, id: crypto.randomUUID(), source: 'plugin ops@example.com' };
    await expect(publisher.publish(input)).rejects.toBe(failure);
    await publisher.publish(input);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual(attempts[1]);
    expect(attempts.map((attempt) => attempt.options.msgID)).toEqual([input.id, input.id]);
  });

  test('prepares direct publishes and validates their serialized representation', async () => {
    const { target, published } = fakeTarget();
    await createNatsPublisher(target).publish({
      ...envelope,
      source: 'plugin ops@example.com',
      payload: { password: 'opaque', nested: { message: 'Bearer abcdefgh1234' } },
    });
    const decoded = published.map((record) =>
      EventEnvelopeSchema.parse(JSON.parse(new TextDecoder().decode(record.payload))),
    );
    expect(decoded).toEqual([
      {
        ...envelope,
        source: 'plugin [REDACTED:email]',
        payload: { nested: { message: 'Bearer [REDACTED:bearer]' } },
      },
    ]);
  });

  test('rejects sensitive metadata and non-JSON payloads before calling NATS', async () => {
    const { target, published } = fakeTarget();
    const publisher = createNatsPublisher(target);
    await expect(publisher.publish({ ...envelope, id: 'ops@example.com' })).rejects.toThrow(
      EnvelopeError,
    );
    await expect(publisher.publish({ ...envelope, payload: { value: 1n } })).rejects.toThrow(
      EnvelopeError,
    );
    expect(published).toHaveLength(0);
  });

  test('publishes the envelope as JSON on the right subject', async () => {
    const { target, published } = fakeTarget();
    await createNatsPublisher(target).publish({ ...envelope, severity: 'critical' });

    const record = published[0];
    expect(record?.subject).toBe('graveshift.project-1.detection.api.signal.oom');
    const decoded = JSON.parse(new TextDecoder().decode(record?.payload)) as EventEnvelope;
    expect(decoded).toEqual({ ...envelope, severity: 'critical' });
  });

  test('propagates a rejected publish', async () => {
    const failure = new Error('publish failed');
    const { target } = fakeTarget(failure);

    await expect(createNatsPublisher(target).publish(envelope)).rejects.toBe(failure);
  });
});

describe('createInMemoryPublisher', () => {
  test('captures every published envelope', async () => {
    const publisher = createInMemoryPublisher();
    const second = { ...envelope, id: 'evt-2', severity: 'warning' as const };

    await publisher.publish(envelope);
    await publisher.publish(second);

    expect(publisher.envelopes).toEqual([envelope, second]);
  });

  test('captures prepared data without retaining mutable payload references', async () => {
    const publisher = createInMemoryPublisher();
    const input = { ...envelope, payload: { message: 'ops@example.com' } };
    await publisher.publish(input);
    input.payload.message = 'changed after publish';
    expect(publisher.envelopes[0]?.payload).toEqual({ message: '[REDACTED:email]' });
    await expect(publisher.publish({ ...envelope, traceId: 'ops@example.com' })).rejects.toThrow(
      EnvelopeError,
    );
    expect(publisher.envelopes).toHaveLength(1);
  });
});
