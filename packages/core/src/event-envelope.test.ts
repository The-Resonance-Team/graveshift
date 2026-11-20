import { describe, expect, test } from 'bun:test';

import { EventEnvelopeSchema, type EventEnvelope } from './schemas';

const envelope: EventEnvelope = {
  id: 'evt-1',
  tenantId: 'tenant-1',
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

  test('rejects a missing tenantId', () => {
    const { tenantId: _tenantId, ...rest } = envelope;
    expect(EventEnvelopeSchema.safeParse(rest).success).toBe(false);
  });
});
