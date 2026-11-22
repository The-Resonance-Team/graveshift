import { describe, expect, test } from 'bun:test';

import { EventEnvelopeSchema, type EventEnvelope } from './schemas';

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

describe('EventEnvelope', () => {
  for (const severity of ['info', 'warning', 'critical'] as const) {
    test(`accepts severity ${severity}`, () => {
      expect(EventEnvelopeSchema.safeParse({ ...envelope, severity }).success).toBe(true);
    });
  }

  test('rejects a bad timestamp', () => {
    expect(EventEnvelopeSchema.safeParse({ ...envelope, observedAt: 'yesterday' }).success).toBe(
      false,
    );
  });

  test('rejects a missing projectId', () => {
    const { projectId: _projectId, ...rest } = envelope;
    expect(EventEnvelopeSchema.safeParse(rest).success).toBe(false);
  });

  for (const field of ['projectId', 'type'] as const) {
    for (const bad of ['has space', '*', '>', '', 'a..b']) {
      test(`rejects ${field} value ${JSON.stringify(bad)}`, () => {
        expect(EventEnvelopeSchema.safeParse({ ...envelope, [field]: bad }).success).toBe(false);
      });
    }
  }

  const stringFields = [
    'id',
    'projectId',
    'source',
    'service',
    'type',
    'observedAt',
    'traceId',
    'fingerprint',
  ] as const;
  for (const field of stringFields) {
    test(`rejects empty ${field}`, () => {
      expect(EventEnvelopeSchema.safeParse({ ...envelope, [field]: '' }).success).toBe(false);
    });
  }

  for (const payload of ['not-an-object', [], null]) {
    test(`rejects payload ${JSON.stringify(payload)}`, () => {
      expect(EventEnvelopeSchema.safeParse({ ...envelope, payload }).success).toBe(false);
    });
  }
});
