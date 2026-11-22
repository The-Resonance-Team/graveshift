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
  payload: { restarts: 3 },
};

describe('PublishEventDto', () => {
  test('accepts the same fields as EventEnvelopeSchema', () => {
    const dto = plainToInstance(PublishEventDto, envelope);
    expect(validateSync(dto)).toEqual([]);
    expect(Object.keys(dto).sort()).toEqual(Object.keys(EventEnvelopeSchema.shape).sort());
  });

  test('rejects an unknown field at the class-validator layer', () => {
    const dto = plainToInstance(PublishEventDto, { ...envelope, extra: true });
    const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });
});
