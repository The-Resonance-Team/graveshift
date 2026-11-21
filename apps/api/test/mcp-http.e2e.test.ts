import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parsePolicy } from '@graveshift/policy';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { MCP_BACKEND, MCP_POLICY } from '../src/mcp/mcp.types';
import { FakeMcpBackend } from './fakes/fake-mcp-backend';

const VALID_TOKEN = 'x'.repeat(32);
const rpc = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
const originalToken = process.env.GRAVESHIFT_MCP_TOKEN;

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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MCP_BACKEND)
      .useValue(new FakeMcpBackend())
      .overrideProvider(MCP_POLICY)
      .useValue(policy)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    process.env.GRAVESHIFT_MCP_TOKEN = VALID_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.GRAVESHIFT_MCP_TOKEN;
    else process.env.GRAVESHIFT_MCP_TOKEN = originalToken;
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

  test('accepts a valid 32-character token', async () => {
    const response = await post(VALID_TOKEN);
    expect(response.status).toBe(200);
  });

  test('refuses a token shorter than 32 characters', async () => {
    await post('short').expect(401);
  });

  test('refuses a request when GRAVESHIFT_MCP_TOKEN is unset', async () => {
    delete process.env.GRAVESHIFT_MCP_TOKEN;
    await post(VALID_TOKEN).expect(401);
  });

  test('refuses a request without a bearer header', async () => {
    const response = await post().expect(401);
    expect(response.headers['www-authenticate']).toContain('Bearer');
  });
});
