import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { parsePolicy } from '@graveshift/policy';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { CREDENTIAL_CONFIG, CREDENTIAL_REPO } from '../src/auth/auth.types';
import { MCP_BACKEND, MCP_POLICY } from '../src/mcp/mcp.types';
import { TEST_CONFIG } from './fakes/auth-test-config';
import { FakeCredentialRepo } from './fakes/fake-credential-repo';
import { accessToken } from './fakes/auth-test-helpers';
import { FakeMcpBackend } from './fakes/fake-mcp-backend';

const rpc = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

const policy = parsePolicy({
  version: 1,
  mode: 'propose',
  approvers: { discordUserIds: [], discordRoleIds: [] },
  limits: {
    maxOpenPrsPerHour: 0,
    maxActionsPerServicePer10Min: 0,
    maxDiagnosisLoops: 0,
    llmDailyBudgetUsd: 0,
  },
  llm: { minConfidenceForPr: 1, minConfidenceForAction: 1 },
  github: { repos: [] },
  rules: [],
  default: 'deny',
});

describe('POST /mcp bearer auth (e2e)', () => {
  let app!: INestApplication;
  let jwtService!: JwtService;
  let mcpToken!: string;
  let metricsToken!: string;
  let pluginKey!: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MCP_BACKEND)
      .useValue(new FakeMcpBackend())
      .overrideProvider(MCP_POLICY)
      .useValue(policy)
      .overrideProvider(CREDENTIAL_CONFIG)
      .useValue(TEST_CONFIG)
      .overrideProvider(CREDENTIAL_REPO)
      .useValue(new FakeCredentialRepo())
      .compile();
    app = moduleRef.createNestApplication();
    jwtService = moduleRef.get(JwtService);
    configureApp(app);
    await app.init();

    const token = accessToken(jwtService, ['tokens:manage', 'incidents:read', 'events:publish']);
    const create = async (kind: 'mcp' | 'plugin', scopes: string[]) => {
      const response = await request(app.getHttpServer())
        .post('/api/credentials')
        .set('authorization', `Bearer ${token}`)
        .send(
          kind === 'plugin'
            ? { kind, name: `${kind}-key`, scopes, service: 'api' }
            : { kind, name: `${kind}-key`, scopes },
        )
        .expect(201);
      return response.body.value as string;
    };
    mcpToken = await create('mcp', ['incidents:read']);
    pluginKey = await create('plugin', ['events:publish']);
    const metricsJwt = accessToken(moduleRef.get(JwtService), ['tokens:manage', 'metrics:read']);
    const metricsResponse = await request(app.getHttpServer())
      .post('/api/credentials')
      .set('authorization', `Bearer ${metricsJwt}`)
      .send({ kind: 'mcp', name: 'metrics-key', scopes: ['metrics:read'] })
      .expect(201);
    metricsToken = metricsResponse.body.value as string;
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (token?: string) => {
    const call = request(app.getHttpServer())
      .post('/mcp')
      .set('accept', 'application/json, text/event-stream');
    return (token ? call.set('authorization', `Bearer ${token}`) : call).send(rpc);
  };

  test('accepts an MCP token from the shared issuer', async () => {
    await post(mcpToken).expect(200);
  });

  test('refuses a short token', async () => {
    await post('short').expect(401);
  });

  test('refuses an unknown token', async () => {
    await post('x'.repeat(32)).expect(401);
  });

  test('refuses a plugin key at the MCP endpoint', async () => {
    await post(pluginKey).expect(401);
  });

  test('refuses a request without a bearer header', async () => {
    const response = await post().expect(401);
    expect(response.headers['www-authenticate']).toContain('Bearer');
  });

  const call = (token: string, method: string, params?: object) =>
    request(app.getHttpServer())
      .post('/mcp')
      .set('accept', 'application/json, text/event-stream')
      .set('authorization', `Bearer ${token}`)
      .send({ jsonrpc: '2.0', id: 7, method, ...(params ? { params } : {}) });

  test('allows an in-scope tools/call', async () => {
    await call(mcpToken, 'tools/call', {
      name: 'get_incident',
      arguments: { id: 'inc-1' },
    }).expect(200);
  });

  test('refuses a wrong-scope prompts/get with 403', async () => {
    await call(metricsToken, 'prompts/get', {
      name: 'triage_incident',
      arguments: { incidentId: 'inc-1' },
    }).expect(403);
  });

  test('refuses a wrong-scope resources/read with 403', async () => {
    await call(metricsToken, 'resources/read', {
      uri: 'graveshift://incidents/inc-1/postmortem',
    }).expect(403);
  });

  test('denies by default when a method has no scope mapping', async () => {
    await call(mcpToken, 'tools/unknown').expect(403);
  });

  test('accepts tools/list for a token holding only fix:propose', async () => {
    const jwt = accessToken(jwtService, ['tokens:manage', 'fix:propose']);
    const created = await request(app.getHttpServer())
      .post('/api/credentials')
      .set('authorization', `Bearer ${jwt}`)
      .send({ kind: 'mcp', name: 'propose-only-key', scopes: ['fix:propose'] })
      .expect(201);
    const proposeToken = created.body.value as string;

    await call(proposeToken, 'tools/list').expect(200);
    await call(proposeToken, 'tools/call', {
      name: 'propose_fix',
      arguments: { incidentId: 'inc-1', action: 'open_pr' },
    }).expect(200);
  });

  test('refuses a primitive outside the token scopes with 403', async () => {
    const response = await request(app.getHttpServer())
      .post('/mcp')
      .set('accept', 'application/json, text/event-stream')
      .set('authorization', `Bearer ${mcpToken}`)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'propose_fix', arguments: { incidentId: 'inc-1', action: 'open_pr' } },
      });
    expect(response.status).toBe(403);
  });
});
