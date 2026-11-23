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
import { IDENTITY_REPO } from '../src/identity/identity.types';
import { InMemoryEventSource } from '../src/mcp/events/events.source';
import { CLOSED_DEPLOYMENTS, MCP_EVENT_SOURCE } from '../src/mcp/events/events.types';
import { MCP_BACKEND, MCP_POLICY } from '../src/mcp/mcp.types';
import { TEST_CONFIG } from './fakes/auth-test-config';
import { FakeCredentialRepo } from './fakes/fake-credential-repo';
import { accessToken, testIdentityRepo, validEnvelope } from './fakes/auth-test-helpers';
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
const envelopeSchema = z.object({ resultType: z.string().optional() }).loose();

const descriptorSchema = z.object({
  name: z.string(),
  delivery: z.array(z.string()),
  inputSchema: z.object({}).loose(),
  payloadSchema: z.object({}).loose(),
});
const listSchema = z.object({ events: z.array(descriptorSchema) });
const pollSchema = z.object({
  events: z.array(
    z.object({
      eventId: z.string(),
      name: z.string(),
      timestamp: z.string(),
      data: z.record(z.string(), z.unknown()),
    }),
  ),
  cursor: z.string(),
  truncated: z.boolean(),
  hasMore: z.boolean(),
  nextPollMs: z.number(),
});

const callRaw = (client: Client, method: string, params: Record<string, unknown>) =>
  client.request({ method, params }, envelopeSchema) as Promise<unknown>;

async function call<S extends z.ZodType>(
  client: Client,
  method: string,
  params: Record<string, unknown>,
  schema: S,
): Promise<z.infer<S>> {
  const value = await callRaw(client, method, params);
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid ${method} result: ${parsed.error.message}`);
  return parsed.data;
}

async function errorCode(
  client: Client,
  method: string,
  params: Record<string, unknown>,
): Promise<number | undefined> {
  const value = await callRaw(client, method, params).catch((reason: unknown) => reason);
  if (typeof value !== 'object' || value === null || !('code' in value)) return undefined;
  const code = (value as { code: unknown }).code;
  return typeof code === 'number' ? code : undefined;
}

describe('MCP Events extension through /mcp (e2e)', () => {
  let app!: INestApplication;
  let moduleRef!: TestingModule;
  let source!: InMemoryEventSource;
  let client!: Client;
  let other!: Client;
  let readerToken!: string;
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
      .overrideProvider(IDENTITY_REPO)
      .useValue(testIdentityRepo())
      .overrideProvider(MCP_EVENT_SOURCE)
      .useValue(source)
      .overrideProvider(CLOSED_DEPLOYMENTS)
      .useValue({ listClosedIds: async () => [] })
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
    readerToken = await create('events-reader', ['incidents:read']);
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
    const result = await call(client, 'events/list', {}, listSchema);
    expect(result.events).toHaveLength(6);
    const type = result.events.find((entry) => entry.name === 'incident.changed');
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
      'triage_incident',
      'write_postmortem',
    ]);
    expect((await client.listResourceTemplates()).resourceTemplates[0]?.uriTemplate).toBe(
      'graveshift://incidents/{id}/postmortem',
    );
  });

  test('bootstraps a poll with a null cursor and persists the returned cursor', async () => {
    const result = await call(
      client,
      'events/poll',
      { name: 'incident.changed', arguments: {}, cursor: null },
      pollSchema,
    );
    expect(result.events).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.hasMore).toBe(false);
    expect(result.nextPollMs).toBeGreaterThan(0);
    persistedCursor = result.cursor;
  });

  test('polls a stored envelope with the persisted cursor and returns schema data', async () => {
    source.push(
      validEnvelope({
        id: 'evt-poll-1',
        type: 'signal.oom',
        payload: { note: 'contact alice@example.com', restarts: 3 },
      }),
    );
    const result = await call(
      client,
      'events/poll',
      { name: 'incident.changed', arguments: {}, cursor: persistedCursor },
      pollSchema,
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      eventId: 'evt-poll-1',
      name: 'incident.changed',
      data: { incidentId: 'evt-poll-1', service: 'api', state: 'open', severity: 'info' },
    });
    expect(JSON.stringify(result.events[0])).not.toContain('alice@example.com');
    expect(JSON.stringify(result.events[0])).not.toContain('restarts');
    expect(result.cursor).not.toBe(persistedCursor);
    persistedCursor = result.cursor;
  });

  test('a second poll with the new cursor returns no events', async () => {
    const result = await call(
      client,
      'events/poll',
      { name: 'incident.changed', arguments: {}, cursor: persistedCursor },
      pollSchema,
    );
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

  test('HTTP guards allow authenticated discovery and deny a wrong event scope', async () => {
    const httpCall = (method: string, params: object) =>
      request(app.getHttpServer())
        .post('/mcp')
        .set('accept', 'application/json, text/event-stream')
        .set('authorization', `Bearer ${readerToken}`)
        .set('MCP-Protocol-Version', '2026-07-28')
        .set('Mcp-Method', method)
        .send({
          jsonrpc: '2.0',
          id: 9,
          method,
          params: {
            ...params,
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        });
    const discovered = await httpCall('events/list', {});
    expect(discovered.status, JSON.stringify(discovered.body)).toBe(200);
    await httpCall('events/poll', { name: 'log.entry', cursor: null }).expect(403);
  });
});
