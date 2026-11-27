import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { accessToken, buildAuthApp, rawToken, type AuthTestApp } from './fakes/auth-test-helpers';
import { setupAuthDatabase } from './database/auth.fixture';
import { dbTestEnabled } from './database/fixtures';

describe.skipIf(!dbTestEnabled)('credential routes (e2e)', () => {
  const fixture = setupAuthDatabase();
  let ctx!: AuthTestApp;
  let app!: INestApplication;
  let manageToken!: string;

  beforeAll(async () => {
    ctx = await buildAuthApp(fixture);
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

  test('POST rejects a non-numeric client project claim with 401', async () => {
    const nonNumeric = accessToken(ctx.jwt, ['tokens:manage', 'events:publish'], {
      clientId: 'client-2',
      projectId: 'project-2',
    });
    await post(nonNumeric, {
      kind: 'plugin',
      name: 'sentry',
      scopes: ['events:publish'],
      service: 'api',
    }).expect(401);
  });

  test('POST rejects a client-supplied projectId with 422', async () => {
    await post(manageToken, {
      kind: 'plugin',
      name: 'sentry',
      scopes: ['events:publish'],
      service: 'api',
      projectId: '12345',
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
    const other = accessToken(ctx.jwt, ['tokens:manage'], {
      clientId: 'client-2',
      projectId: '12346',
    });
    const response = await request(app.getHttpServer())
      .get('/api/credentials')
      .set('authorization', `Bearer ${other}`)
      .expect(200);
    expect(response.body.items).toEqual([]);
  });

  test('POST accepts a plugin key without a service binding', async () => {
    const response = await post(manageToken, {
      kind: 'plugin',
      name: 'unbound',
      scopes: ['events:publish'],
    }).expect(201);
    expect(response.body.service).toBeNull();
  });

  test('POST rejects a service binding on an MCP token', async () => {
    await post(manageToken, {
      kind: 'mcp',
      name: 'bound-reader',
      scopes: ['incidents:read'],
      service: 'api',
    }).expect(422);
  });

  test('POST rejects a blank or null service binding', async () => {
    await post(manageToken, {
      kind: 'plugin',
      name: 'blank-service',
      scopes: ['events:publish'],
      service: '   ',
    }).expect(422);
    await post(manageToken, {
      kind: 'plugin',
      name: 'null-service',
      scopes: ['events:publish'],
      service: null,
    }).expect(422);
  });

  test('the 11th active credential fails and a revoke frees a slot', async () => {
    const fresh = await buildAuthApp(fixture);
    const token = accessToken(fresh.jwt, ['tokens:manage', 'incidents:read']);
    const issue = () =>
      request(fresh.app.getHttpServer())
        .post('/api/credentials')
        .set('authorization', `Bearer ${token}`)
        .send({ kind: 'mcp', name: 'reader', scopes: ['incidents:read'] });
    const ids: string[] = [];
    // Issues run one by one so the cap counts committed records.
    await Array.from({ length: 10 }).reduce(async (previous) => {
      await previous;
      const response = await issue().expect(201);
      ids.push(response.body.id as string);
    }, Promise.resolve());
    await issue().expect(409);
    await request(fresh.app.getHttpServer())
      .delete(`/api/credentials/${ids[0]}`)
      .set('authorization', `Bearer ${token}`)
      .expect(204);
    await issue().expect(201);
    await fresh.app.close();
  });

  test('credential routes are throttled by client id', async () => {
    const limited = await buildAuthApp(fixture, { eventRateLimit: 2 });
    // Two different JWTs for client-1 share one throttle bucket.
    const tokens = [
      rawToken(limited.jwt, { scope: ['tokens:manage', 'incidents:read'] }),
      rawToken(limited.jwt, { scope: ['tokens:manage', 'incidents:read', 'logs:read'] }),
    ];
    const call = (token: string) =>
      request(limited.app.getHttpServer())
        .post('/api/credentials')
        .set('authorization', `Bearer ${token}`)
        .send({ kind: 'mcp', name: 'reader', scopes: ['incidents:read'] });
    await call(tokens[0] as string).expect(201);
    await call(tokens[1] as string).expect(201);
    await call(tokens[0] as string).expect(429);
    await limited.app.close();
  });

  test('a client in another project cannot revoke this credential', async () => {
    const created = await post(manageToken, {
      kind: 'mcp',
      name: 'owned',
      scopes: ['incidents:read'],
    }).expect(201);
    const otherProject = accessToken(ctx.jwt, ['tokens:manage'], {
      clientId: 'client-2',
      projectId: '12346',
    });
    await request(app.getHttpServer())
      .delete(`/api/credentials/${created.body.id}`)
      .set('authorization', `Bearer ${otherProject}`)
      .expect(404);
  });
});
