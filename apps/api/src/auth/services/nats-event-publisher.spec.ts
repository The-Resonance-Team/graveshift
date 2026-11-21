import type { EventEnvelope } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import { TEST_CONFIG } from '../../../test/fakes/auth-test-config';
import { NatsEventPublisher } from './nats-event-publisher';

const envelope: EventEnvelope = {
  id: 'evt-1',
  tenantId: 'tenant-1',
  source: 'plugin.nestjs',
  service: 'api',
  type: 'signal.oom',
  severity: 'info',
  observedAt: '2026-11-20T10:00:00.000Z',
  traceId: 'trace-1',
  fingerprint: 'api:oom',
  payload: {},
};

describe('NatsEventPublisher', () => {
  test('fails closed with 503 when NATS is not configured', async () => {
    const publisher = new NatsEventPublisher({ ...TEST_CONFIG, natsUrl: undefined });
    let code = 0;
    try {
      await publisher.publish(envelope);
    } catch (error) {
      code = (error as { status?: number }).status ?? 0;
    }
    expect(code).toBe(503);
  });
});
