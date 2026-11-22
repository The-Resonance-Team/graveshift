import { EventEnvelopeSchema, type EventEnvelope } from '@graveshift/core';
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
});
