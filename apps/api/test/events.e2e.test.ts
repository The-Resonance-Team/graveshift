import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import request from 'supertest';

import {
  accessToken,
  buildAuthApp,
  validEnvelope,
  type AuthTestApp,
} from './fakes/auth-test-helpers';

describe('POST /api/events (e2e)', () => {
  let ctx!: AuthTestApp;
  let app!: INestApplication;
  let manageToken!: string;

  beforeAll(async () => {
    ctx = await buildAuthApp();
    app = ctx.app;
    manageToken = accessToken(ctx.jwt, [
      'tokens:manage',
      'incidents:read',
      'logs:read',
      'events:publish',
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createKey(body: object): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/credentials')
      .set('authorization', `Bearer ${manageToken}`)
      .send(body)
      .expect(201);
    return response.body.value as string;
  }

  const push = (key: string | undefined, body: object) => {
    const call = request(app.getHttpServer()).post('/api/events');
    return (key ? call.set('authorization', `Bearer ${key}`) : call).send(body);
  };

  test('accepts a valid envelope, redacts it and publishes it', async () => {
    const key = await createKey({ kind: 'plugin', name: 'publisher', scopes: ['events:publish'] });
    const envelope = validEnvelope({
      id: 'evt-ok',
      payload: { note: 'write to alice@example.com now', restarts: 3 },
    });
    await push(key, envelope).expect(202);
    expect(ctx.publisher.envelopes.some((item) => item.id === 'evt-ok')).toBe(true);
    const published = ctx.publisher.envelopes.find((item) => item.id === 'evt-ok');
    expect(published?.payload.note).not.toContain('alice@example.com');
    expect(published?.payload.restarts).toBe(3);
  });

  test('rejects a request without a bearer key', async () => {
    await push(undefined, validEnvelope()).expect(401);
  });

  test('rejects an MCP token at the ingest route', async () => {
    const key = await createKey({ kind: 'mcp', name: 'reader', scopes: ['incidents:read'] });
    await push(key, validEnvelope()).expect(401);
  });

  test('rejects a plugin key without events:publish', async () => {
    const key = await createKey({ kind: 'plugin', name: 'no-scope', scopes: ['events:publish'] });
    const record = ctx.repo.records.find(
      (item) => item.prefix.length > 0 && item.name === 'no-scope',
    );
    if (record) record.scopes = [];
    await push(key, validEnvelope()).expect(401);
  });

  test('rejects an unknown field with 422', async () => {
    const key = await createKey({
      kind: 'plugin',
      name: 'unknown-field',
      scopes: ['events:publish'],
    });
    await push(key, { ...validEnvelope(), extra: 1 }).expect(422);
  });

  test('rejects a malformed envelope with 422', async () => {
    const key = await createKey({ kind: 'plugin', name: 'malformed', scopes: ['events:publish'] });
    await push(key, { ...validEnvelope(), observedAt: 'yesterday' }).expect(422);
    await push(key, { ...validEnvelope(), type: 'bad type' }).expect(422);
  });

  test('rejects an oversized envelope with 413', async () => {
    const key = await createKey({ kind: 'plugin', name: 'oversized', scopes: ['events:publish'] });
    await push(key, validEnvelope({ payload: { blob: 'x'.repeat(4000) } })).expect(413);
  });

  test('rejects a tenant mismatch with 403', async () => {
    const key = await createKey({ kind: 'plugin', name: 'tenant', scopes: ['events:publish'] });
    await push(key, validEnvelope({ tenantId: 'tenant-2' })).expect(403);
  });

  test('checks an optional service binding', async () => {
    const key = await createKey({
      kind: 'plugin',
      name: 'bound',
      scopes: ['events:publish'],
      service: 'api',
    });
    await push(key, validEnvelope({ service: 'worker' })).expect(403);
    await push(key, validEnvelope({ service: 'api', id: 'evt-bound' })).expect(202);
  });

  test('rejects a revoked key', async () => {
    const key = await createKey({ kind: 'plugin', name: 'revoked', scopes: ['events:publish'] });
    const id = ctx.repo.records.find((item) => item.name === 'revoked')?.id;
    await request(app.getHttpServer())
      .delete(`/api/credentials/${id}`)
      .set('authorization', `Bearer ${manageToken}`)
      .expect(204);
    await push(key, validEnvelope()).expect(401);
  });

  test('rejects an expired key', async () => {
    const key = await createKey({ kind: 'plugin', name: 'expired', scopes: ['events:publish'] });
    const record = ctx.repo.records.find((item) => item.name === 'expired');
    if (record) record.expiresAt = '2020-01-01T00:00:00.000Z';
    await push(key, validEnvelope()).expect(401);
  });

  test('bounds the request rate', async () => {
    const limited = await buildAuthApp({ eventRateLimit: 2 });
    const token = accessToken(limited.jwt, ['tokens:manage', 'events:publish']);
    const created = await request(limited.app.getHttpServer())
      .post('/api/credentials')
      .set('authorization', `Bearer ${token}`)
      .send({ kind: 'plugin', name: 'limited', scopes: ['events:publish'] })
      .expect(201);
    const pushLimited = (body: object) =>
      request(limited.app.getHttpServer())
        .post('/api/events')
        .set('authorization', `Bearer ${created.body.value as string}`)
        .send(body);
    await pushLimited(validEnvelope({ id: 'r1' })).expect(202);
    await pushLimited(validEnvelope({ id: 'r2' })).expect(202);
    await pushLimited(validEnvelope({ id: 'r3' })).expect(429);
    await limited.app.close();
  });
});
