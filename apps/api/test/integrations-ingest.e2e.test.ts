import type { INestApplication } from '@nestjs/common';
import { EventEnvelopeSchema, type EventEnvelope } from '@graveshift/core';
import { createHttpPublisher } from '@graveshift/events';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { accessToken, buildAuthApp, type AuthTestApp } from './fakes/auth-test-helpers';

function integrationEnvelope(kind: 'plugin' | 'collector', id: string): EventEnvelope {
  return EventEnvelopeSchema.parse({
    id,
    tenantId: 'tenant-1',
    source: kind === 'plugin' ? 'plugin.nestjs' : 'collector.fake',
    service: 'api',
    type: kind === 'plugin' ? 'http.request' : 'signal.fake',
    severity: kind === 'plugin' ? 'info' : 'warning',
    observedAt: '2026-11-22T10:00:00.000Z',
    traceId: `trace-${id}`,
    fingerprint: `${kind}_event`,
    payload: { via: kind },
  });
}

describe('integration ingest through POST /api/events', () => {
  let ctx!: AuthTestApp;
  let app!: INestApplication;

  beforeAll(async () => {
    ctx = await buildAuthApp();
    app = ctx.app;
  });

  afterAll(async () => {
    await app.close();
  });

  async function pluginKey(): Promise<string> {
    const token = accessToken(ctx.jwt, ['tokens:manage', 'events:publish']);
    const response = await request(app.getHttpServer())
      .post('/api/credentials')
      .set('authorization', `Bearer ${token}`)
      .send({ kind: 'plugin', name: 'integration', scopes: ['events:publish'], service: 'api' })
      .expect(201);
    return response.body.value as string;
  }

  test('a Plugin and a Collector publish through POST /api/events with the in-memory fake', async () => {
    const key = await pluginKey();
    const seenHeaders: string[] = [];

    // The fetch stub dispatches to the Nest app. No network call is made.
    const stubFetch = (async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('http://graveshift.local/api/events');
      const headers = new Headers(init?.headers);
      seenHeaders.push(headers.get('authorization') ?? '');
      let call = request(app.getHttpServer()).post('/api/events');
      headers.forEach((value, name) => {
        call = call.set(name, value);
      });
      const response = await call.send(String(init?.body ?? ''));
      return new Response(null, { status: response.status });
    }) as typeof fetch;

    const publisher = createHttpPublisher({
      baseUrl: 'http://graveshift.local',
      apiKey: key,
      fetch: stubFetch,
    });

    const plugin = integrationEnvelope('plugin', 'evt-plugin');
    const collector = integrationEnvelope('collector', 'evt-collector');
    await publisher.publish(plugin);
    await publisher.publish(collector);

    expect(ctx.publisher.envelopes.map((item) => item.id)).toEqual(['evt-plugin', 'evt-collector']);
    expect(ctx.publisher.envelopes[0]?.source).toBe('plugin.nestjs');
    expect(ctx.publisher.envelopes[1]?.source).toBe('collector.fake');
    expect(seenHeaders).toEqual([`Bearer ${key}`, `Bearer ${key}`]);
  });
});
