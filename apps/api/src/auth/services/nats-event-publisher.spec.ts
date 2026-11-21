import type { EventEnvelope } from '@graveshift/core';
import { createInMemoryPublisher } from '@graveshift/events/testing';
import type { NatsPublisherHandle } from '@graveshift/events/nats';
import { describe, expect, test } from 'bun:test';

import type { EventsConfig } from '../../mcp/events/events.config';
import type { NatsConnector } from '../auth.types';
import { NatsEventPublisher } from './nats-event-publisher';

const config = (natsUrl?: string): EventsConfig => ({
  natsUrl,
  stream: 'GRAVESHIFT_EVENTS',
});

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

const makeHandle = (): NatsPublisherHandle => ({
  publisher: createInMemoryPublisher(),
  close: async () => undefined,
});

describe('NatsEventPublisher', () => {
  test('fails closed with 503 when NATS is not configured', async () => {
    const publisher = new NatsEventPublisher(config(), async () =>
      makeHandle(),
    );
    let code = 0;
    try {
      await publisher.publish(envelope);
    } catch (error) {
      code = (error as { status?: number }).status ?? 0;
    }
    expect(code).toBe(503);
  });

  test('shares one connection across concurrent publishes', async () => {
    let connects = 0;
    const connect: NatsConnector = async () => {
      connects += 1;
      await Promise.resolve();
      return makeHandle();
    };
    const publisher = new NatsEventPublisher(
      config('nats://127.0.0.1:4222'),
      connect,
    );
    await Promise.all([
      publisher.publish(envelope),
      publisher.publish(envelope),
      publisher.publish(envelope),
    ]);
    expect(connects).toBe(1);
    await publisher.onModuleDestroy();
  });

  test('retries after a failed connect', async () => {
    let attempts = 0;
    const connect: NatsConnector = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('connection refused');
      return makeHandle();
    };
    const publisher = new NatsEventPublisher(
      config('nats://127.0.0.1:4222'),
      connect,
    );
    let code = 0;
    try {
      await publisher.publish(envelope);
    } catch (error) {
      code = (error as { status?: number }).status ?? 0;
    }
    expect(code).toBe(503);
    await publisher.publish(envelope);
    expect(attempts).toBe(2);
  });

  test('shutdown ignores a rejected connection', async () => {
    const connect: NatsConnector = async () => {
      throw new Error('connection refused');
    };
    const publisher = new NatsEventPublisher(
      config('nats://127.0.0.1:4222'),
      connect,
    );
    expect(publisher.publish(envelope)).rejects.toThrow();
    expect(publisher.onModuleDestroy()).resolves.toBeUndefined();
  });
});
