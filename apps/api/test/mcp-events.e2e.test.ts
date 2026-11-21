import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { Client } from '@modelcontextprotocol/client';
import { JwtService } from '@nestjs/jwt';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { Test, type TestingModule } from '@nestjs/testing';
import { parsePolicy } from '@graveshift/policy';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import request from 'supertest';
import { z } from 'zod';

import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { CREDENTIAL_CONFIG, CREDENTIAL_REPO } from '../src/auth/auth.types';
import { InMemoryEventSource } from '../src/mcp/events/events.source';
import { MCP_EVENT_SOURCE } from '../src/mcp/events/events.types';
import { MCP_BACKEND, MCP_POLICY } from '../src/mcp/mcp.types';
import { TEST_CONFIG } from './fakes/auth-test-config';
import { FakeCredentialRepo } from './fakes/fake-credential-repo';
import { accessToken, validEnvelope } from './fakes/auth-test-helpers';
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

// The client strips the wire `resultType` discriminator before validation.
const resultSchema = z
  .object({ resultType: z.string().optional(), events: z.array(z.unknown()).optional() })
  .loose();

interface PollResult {
  events: Array<Record<string, any>>;
  cursor: string;
  truncated: boolean;
  hasMore: boolean;
  nextPollMs: number;
}

const call = (client: Client, method: string, params: Record<string, unknown>) =>
  client.request({ method, params }, resultSchema) as Promise<Record<string, any>>;

const errorCode = async (
  client: Client,
  method: string,
  params: Record<string, unknown>,
): Promise<number | undefined> => {
  const error = await call(client, method, params).catch((reason: unknown) => reason);
  return (error as { code?: number }).code;
};

describe('MCP Events extension through /mcp (e2e)', () => {
  let app!: INestApplication;
  let moduleRef!: TestingModule;
  let source!: InMemoryEventSource;
  let client!: Client;
  let other!: Client;
  let persistedCursor!: string;

  beforeAll(async () => {
    source = new InMemoryEventSource();
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MCP_BACKEND)
      .useValue(new FakeMcpBackend())
      .overrideProvider(MCP_POLICY)
      .useValue(policy)
      .overrideProvider(CREDENTIAL_CONFIG)
      .useValue(TEST_CONFIG)
      .overrideProvider(CREDENTIAL_REPO)
      .useValue(new FakeCredentialRepo())
      .overrideProvider(MCP_EVENT_SOURCE)
      .useValue(source)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const manage = accessToken(moduleRef.get(JwtService), [
      'tokens:manage',
      'incidents:read',
      'logs:read',
    ]);
    const create = async (name: string, scopes: string[]) => {
      const response = await request(app.getHttpServer())
        .post('/api/credentials')
        .set('authorization', `Bearer ${manage}`)
        .send({ kind: 'mcp', name, scopes })
        .expect(201);
      return response.body.value as string;
    };
    const readerToken = await create('events-reader', ['incidents:read']);
    const otherToken = await create('events-other', ['logs:read']);
    client = await connectMcpClient(moduleRef, { token: readerToken });
    other = await connectMcpClient(moduleRef, { token: otherToken });
  });

  afterAll(async () => {
    await client?.close();
    await other?.close();
    await app?.close();
  });

  test('discovers six Event types with inputSchema, payloadSchema and poll delivery', async () => {
    const result = await call(client, 'events/list', {});
    expect(result.events).toHaveLength(6);
    const type = result.events.find((entry: any) => entry.name === 'incident.changed');
    expect(type).toMatchObject({
      delivery: ['poll'],
      inputSchema: { type: 'object' },
      payloadSchema: { type: 'object' },
    });
  });

  test('advertises the extension and keeps tools, prompts and resource unchanged', async () => {
    expect(client.getServerCapabilities()?.extensions?.['io.modelcontextprotocol/events']).toEqual({
      listChanged: false,
    });
    expect((await client.listTools()).tools).toHaveLength(9);
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual([
      'triage-incident',
      'write-postmortem',
    ]);
    expect((await client.listResourceTemplates()).resourceTemplates[0]?.uriTemplate).toBe(
      'graveshift://incidents/{id}/postmortem',
    );
  });

  test('bootstraps a poll with a null cursor and persists the returned cursor', async () => {
    const result = (await call(client, 'events/poll', {
      name: 'incident.changed',
      arguments: {},
      cursor: null,
    })) as PollResult;
    expect(result.events).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.hasMore).toBe(false);
    expect(result.nextPollMs).toBeGreaterThan(0);
    expect(typeof result.cursor).toBe('string');
    persistedCursor = result.cursor;
  });

  test('polls a stored envelope with the persisted cursor and redacts the payload', async () => {
    source.push(
      validEnvelope({
        id: 'evt-poll-1',
        type: 'signal.oom',
        payload: { note: 'contact alice@example.com', restarts: 3 },
      }),
    );
    const result = (await call(client, 'events/poll', {
      name: 'incident.changed',
      arguments: {},
      cursor: persistedCursor,
    })) as PollResult;
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      eventId: 'evt-poll-1',
      name: 'incident.changed',
      data: { service: 'api', severity: 'info', restarts: 3 },
    });
    expect(JSON.stringify(result.events[0])).not.toContain('alice@example.com');
    expect(result.cursor).not.toBe(persistedCursor);
    persistedCursor = result.cursor;
  });

  test('a second poll with the new cursor returns no events', async () => {
    const result = (await call(client, 'events/poll', {
      name: 'incident.changed',
      arguments: {},
      cursor: persistedCursor,
    })) as PollResult;
    expect(result.events).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  test('checks the scope that the Event type declares', async () => {
    expect(await errorCode(other, 'events/poll', { name: 'incident.changed', cursor: null })).toBe(
      -32024,
    );
  });

  test('returns NotFound for an unknown Event type', async () => {
    expect(await errorCode(client, 'events/poll', { name: 'missing.type', cursor: null })).toBe(
      -32023,
    );
  });

  test('marks push and webhook as unsupported in v2', async () => {
    const codes = await Promise.all(
      ['events/stream', 'events/subscribe', 'events/unsubscribe'].map((method) =>
        errorCode(client, method, {}),
      ),
    );
    expect(codes).toEqual([-32026, -32026, -32026]);
  });

  test('serves one MCP surface only', async () => {
    await request(app.getHttpServer())
      .post('/mcp/events')
      .set('authorization', `Bearer ${'x'.repeat(32)}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'events/list' })
      .expect(404);
  });
});
