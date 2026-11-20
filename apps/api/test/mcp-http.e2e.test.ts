import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parsePolicy } from '@graveshift/policy';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { McpTokenVerifierService } from '../src/mcp/mcp-token.verifier';
import { MCP_BACKEND, MCP_POLICY } from '../src/mcp/mcp.types';
import { FakeMcpBackend } from './fakes/fake-mcp-backend';

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

const rpc = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

describe('POST /mcp (e2e)', () => {
  let app!: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MCP_BACKEND)
      .useValue(new FakeMcpBackend())
      .overrideProvider(MCP_POLICY)
      .useValue(policy)
      .overrideProvider(McpTokenVerifierService)
      .useValue({ verifyAccessToken: async () => null })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  test('rejects a request without a bearer token', async () => {
    const response = await request(app.getHttpServer())
      .post('/mcp')
      .set('accept', 'application/json, text/event-stream')
      .send(rpc)
      .expect(401);
    expect(response.headers['www-authenticate']).toContain('Bearer');
  });

  test('rejects an invalid bearer token', async () => {
    await request(app.getHttpServer())
      .post('/mcp')
      .set('authorization', 'Bearer wrong-token')
      .set('accept', 'application/json, text/event-stream')
      .send(rpc)
      .expect(401);
  });
});
