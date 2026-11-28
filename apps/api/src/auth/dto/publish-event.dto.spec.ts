import { EventEnvelopeSchema, type EventEnvelope } from '@graveshift/core';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, test } from 'bun:test';

import { PublishEventDto } from './publish-event.dto';

const envelope: EventEnvelope = {
  id: 'evt-1',
  projectId: 'project-1',
  source: 'native',
  service: 'api',
  type: 'signal.oom',
  severity: 'info',
  observedAt: '2026-11-20T10:00:00.000Z',
  traceId: 'trace-1',
  fingerprint: 'api:oom',
  deploymentId: null,
  environment: null,
  payload: { restarts: 3 },
};

describe('PublishEventDto', () => {
  test.each([
    ['2026-11-20T17:00:00.123456+07:00', '2026-11-20T10:00:00.123456Z'],
    ['2026-11-20T17:00:00.999999999+07:00', '2026-11-20T10:00:00.999999999Z'],
    ['2026-11-20T23:59:59.999999999-05:00', '2026-11-21T04:59:59.999999999Z'],
    ['2026-11-20T00:00:00.000000001+07:00', '2026-11-19T17:00:00.000000001Z'],
    ['2026-11-20T10:00:00.999999999Z', '2026-11-20T10:00:00.999999999Z'],
  ])('normalizes timestamps without rounding fractional seconds (%#)', (observedAt, expected) => {
    const dto = plainToInstance(PublishEventDto, {
      ...envelope,
      observedAt,
    });
    expect(validateSync(dto)).toEqual([]);
    expect(dto.observedAt).toBe(expected);
    expect(EventEnvelopeSchema.parse(dto).observedAt).toBe(expected);
  });

  test.each([
    '2026-11-20',
    '2026-11-20T10:00:00',
    '2026-02-30T10:00:00Z',
    '2026-11-20T10Z',
    true,
    1,
    null,
  ])('rejects a timestamp without a valid full time and timezone (%#)', (observedAt) => {
    const errors = validateSync(plainToInstance(PublishEventDto, { ...envelope, observedAt }));
    expect(errors.map((error) => error.property)).toContain('observedAt');
  });

  test('accepts the same fields as EventEnvelopeSchema', () => {
    const dto = plainToInstance(PublishEventDto, envelope);
    expect(validateSync(dto)).toEqual([]);
    expect(Object.keys(dto).sort()).toEqual(Object.keys(EventEnvelopeSchema.shape).sort());
  });

  test('accepts a 40-hex deploymentId and an Environment name', () => {
    const dto = plainToInstance(PublishEventDto, {
      ...envelope,
      deploymentId: 'a'.repeat(40),
      environment: 'production',
    });
    expect(validateSync(dto)).toEqual([]);
  });

  test('rejects a non-hex or short deploymentId', () => {
    for (const deploymentId of ['A'.repeat(40), 'abc', 'z'.repeat(40)]) {
      const dto = plainToInstance(PublishEventDto, { ...envelope, deploymentId });
      expect(validateSync(dto).length).toBeGreaterThan(0);
    }
  });

  test('rejects an unknown field at the class-validator layer', () => {
    const dto = plainToInstance(PublishEventDto, { ...envelope, extra: true });
    const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });
});
