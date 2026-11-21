import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { accessToken, buildAuthApp, type AuthTestApp } from './fakes/auth-test-helpers';

describe('credential routes (e2e)', () => {
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

  const post = (token: string | undefined, body: object) => {
    const call = request(app.getHttpServer()).post('/api/credentials');
    return (token ? call.set('authorization', `Bearer ${token}`) : call).send(body);
  };

  test('POST needs a client-credentials token', async () => {
    await post(undefined, { kind: 'mcp', name: 'reader', scopes: ['incidents:read'] }).expect(401);
  });

  test('POST needs the tokens:manage scope', async () => {
    const token = accessToken(ctx.jwt, ['incidents:read']);
    await post(token, { kind: 'mcp', name: 'reader', scopes: ['incidents:read'] }).expect(401);
  });

  test('POST issues an MCP token and returns the value once', async () => {
    const response = await post(manageToken, {
      kind: 'mcp',
      name: 'reader',
      scopes: ['incidents:read', 'logs:read'],
    }).expect(201);
    expect(response.body.kind).toBe('mcp');
    expect(response.body.name).toBe('reader');
    expect(response.body.scopes).toEqual(['incidents:read', 'logs:read']);
    expect(response.body.value.length).toBeGreaterThan(32);
    expect(response.body.prefix.startsWith('mcp_')).toBe(true);
    expect(response.body.revokedAt).toBeNull();

    const list = await request(app.getHttpServer())
      .get('/api/credentials')
      .set('authorization', `Bearer ${manageToken}`)
      .expect(200);
    const row = list.body.items.find((item: { id: string }) => item.id === response.body.id);
    expect(row.name).toBe('reader');
    expect(row).not.toHaveProperty('value');
    expect(row).not.toHaveProperty('hash');
  });

  test('POST issues a plugin key with a service binding', async () => {
    const response = await post(manageToken, {
      kind: 'plugin',
      name: 'ingest',
      scopes: ['events:publish'],
      service: 'api',
      ttlSeconds: 600,
    }).expect(201);
    expect(response.body.kind).toBe('plugin');
    expect(response.body.service).toBe('api');
    expect(response.body.expiresAt).not.toBeNull();
  });

  test('POST rejects an unknown field with 422', async () => {
    await post(manageToken, {
      kind: 'mcp',
      name: 'reader',
      scopes: ['incidents:read'],
      admin: true,
    }).expect(422);
  });

  test('POST rejects forbidden scopes at the DTO', async () => {
    await post(manageToken, {
      kind: 'mcp',
      name: 'reader',
      scopes: ['tokens:manage'],
    }).expect(422);
  });

  test('POST rejects a scope from another surface', async () => {
    await post(manageToken, {
      kind: 'mcp',
      name: 'reader',
      scopes: ['events:publish'],
    }).expect(403);
  });

  test('POST rejects a scope the client does not hold', async () => {
    const token = accessToken(ctx.jwt, ['tokens:manage']);
    await post(token, { kind: 'mcp', name: 'reader', scopes: ['audit:read'] }).expect(403);
  });

  test('DELETE revokes one credential', async () => {
    const created = await post(manageToken, {
      kind: 'mcp',
      name: 'to-revoke',
      scopes: ['incidents:read'],
    }).expect(201);
    await request(app.getHttpServer())
      .delete(`/api/credentials/${created.body.id}`)
      .set('authorization', `Bearer ${manageToken}`)
      .expect(204);
    const list = await request(app.getHttpServer())
      .get('/api/credentials')
      .set('authorization', `Bearer ${manageToken}`)
      .expect(200);
    const row = list.body.items.find((item: { id: string }) => item.id === created.body.id);
    expect(row.revokedAt).not.toBeNull();
  });

  test('GET lists only the caller credentials', async () => {
    const other = accessToken(ctx.jwt, ['tokens:manage'], { clientId: 'client-2' });
    const response = await request(app.getHttpServer())
      .get('/api/credentials')
      .set('authorization', `Bearer ${other}`)
      .expect(200);
    expect(response.body.items).toEqual([]);
  });
});
