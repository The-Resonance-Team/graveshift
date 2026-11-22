import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { TEST_CLIENT_SECRET } from './fakes/auth-test-config';
import { buildAuthApp, rawToken, type AuthTestApp } from './fakes/auth-test-helpers';

describe('OAuth 2.1 client credentials (e2e)', () => {
  let ctx!: AuthTestApp;
  let app!: INestApplication;

  beforeAll(async () => {
    ctx = await buildAuthApp();
    app = ctx.app;
  });

  afterAll(async () => {
    await app.close();
  });

  const exchange = (clientId: string, secret: string) =>
    request(app.getHttpServer())
      .post('/api/oauth/token')
      .send({ grant_type: 'client_credentials', client_id: clientId, client_secret: secret });

  const useToken = (token: string) =>
    request(app.getHttpServer()).get('/api/credentials').set('authorization', `Bearer ${token}`);

  test('exchanges client credentials for a usable token', async () => {
    const response = await exchange('client-1', TEST_CLIENT_SECRET).expect(200);
    expect(response.body.token_type).toBe('Bearer');
    expect(response.body.access_token.split('.')).toHaveLength(3);
    await useToken(response.body.access_token).expect(200);
  });

  test('refuses a wrong client secret', async () => {
    await exchange('client-1', 'wrong-secret-value-1234').expect(401);
  });

  test('refuses an unknown client', async () => {
    await exchange('client-9', TEST_CLIENT_SECRET).expect(401);
  });

  test('refuses a token signed with another secret', async () => {
    await useToken(rawToken(ctx.jwt, { secret: 'another-test-secret-32-chars-long' })).expect(401);
  });

  test('refuses a token with the wrong audience', async () => {
    await useToken(rawToken(ctx.jwt, { audience: 'another-audience' })).expect(401);
  });

  test('refuses an expired token', async () => {
    await useToken(rawToken(ctx.jwt, { expired: true })).expect(401);
  });

  test('refuses a token with no exp claim', async () => {
    await useToken(rawToken(ctx.jwt, { noExp: true })).expect(401);
  });

  test('throttles the token endpoint', async () => {
    const limited = await buildAuthApp({ eventRateLimit: 2 });
    const attempt = () =>
      request(limited.app.getHttpServer())
        .post('/api/oauth/token')
        .send({ grant_type: 'client_credentials', client_id: 'client-1', client_secret: 'wrong' });
    await attempt().expect(401);
    await attempt().expect(401);
    await attempt().expect(429);
    await limited.app.close();
  });

  test('refuses a token with the wrong issuer', async () => {
    await useToken(rawToken(ctx.jwt, { issuer: 'another-issuer' })).expect(401);
  });

  test('refuses a token claiming a scope outside the client registry', async () => {
    await useToken(
      rawToken(ctx.jwt, {
        sub: 'client-2',
        projectId: 'project-2',
        scope: ['tokens:manage', 'fix:propose'],
      }),
    ).expect(401);
  });

  test('refuses a forged project claim', async () => {
    await useToken(rawToken(ctx.jwt, { projectId: 'project-forged' })).expect(401);
  });
});
