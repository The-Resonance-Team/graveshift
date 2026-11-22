import { getHttpClientToken, HttpNetworkError, HttpResponseError } from '@nestjs/http-client';
import { Test } from '@nestjs/testing';
import type { CounterSnapshot, IncidentView, LimitCounters } from '@graveshift/core';
import { parsePolicy } from '@graveshift/policy';
import { describe, expect, test } from 'bun:test';

import { HttpMcpBackend } from './mcp.backend';
import { DaemonUnavailableError } from './mcp.errors';
import { McpTools } from './mcp.tools';
import { MCP_BACKEND, MCP_ENV_MODE, MCP_POLICY } from './mcp.types';

const DAEMON_CLIENT = getHttpClientToken('daemon-read');

const ZERO_COUNTERS: LimitCounters = {
  openPrsLastHour: 0,
  actionsLast10Min: 0,
  diagnosisLoops: 0,
  llmSpentTodayUsd: 0,
};

const snapshot = (
  counters: LimitCounters,
  source: 'wired' | 'not_wired' = 'wired',
): CounterSnapshot => ({
  source,
  counters,
});

const incident: IncidentView = {
  incident: {
    id: 'inc-1',
    service: 'api',
    state: 'diagnosed',
    openedAt: '2026-01-01T00:00:00.000Z',
    diagnosis: { confidence: 0.8 },
  },
  severity: 'critical',
  detections: [{ rule: 'crash_loop' }],
};

const policy = parsePolicy({
  version: 1,
  mode: 'propose',
  approvers: { discordUserIds: [], discordRoleIds: [] },
  limits: {
    maxOpenPrsPerHour: 1,
    maxActionsPerServicePer10Min: 2,
    maxDiagnosisLoops: 5,
    llmDailyBudgetUsd: 2,
  },
  llm: { minConfidenceForPr: 0.5, minConfidenceForAction: 0.5 },
  github: { repos: [] },
  rules: [{ id: 'allow-pr', action: 'open_pr', effect: 'allow' }],
  default: 'deny',
});

const fakeDaemon = (
  countersReply: unknown = snapshot(ZERO_COUNTERS),
  overrides: Record<string, unknown> = {},
) => {
  const calls: string[] = [];
  const replies: Record<string, unknown> = {
    '/read/services': [{ name: 'api', status: 'haunting' }],
    '/read/incidents': [incident, incident],
    '/read/incidents/:id': incident,
    '/read/counters': countersReply,
    '/read/audit': [],
    '/read/audit/verify': { ok: true, length: 0 },
    '/read/logs': ['line one', 'line two'],
    '/read/metrics': { value: 1 },
    ...overrides,
  };
  return {
    calls,
    client: {
      get: async (url: string) => {
        calls.push(url);
        const data = replies[url.startsWith('/read/incidents/') ? '/read/incidents/:id' : url];
        if (data === undefined) throw new Error(`unexpected path ${url}`);
        return { data };
      },
    },
  };
};

const build = async (client: unknown) => {
  const moduleRef = await Test.createTestingModule({
    providers: [
      HttpMcpBackend,
      McpTools,
      { provide: MCP_BACKEND, useClass: HttpMcpBackend },
      { provide: DAEMON_CLIENT, useValue: client },
      { provide: MCP_POLICY, useValue: policy },
      { provide: MCP_ENV_MODE, useValue: 'production' },
    ],
  }).compile();
  return {
    backend: moduleRef.get(HttpMcpBackend),
    tools: moduleRef.get(McpTools),
  };
};

const httpError = (status: number, body: unknown) =>
  new HttpResponseError({ method: 'GET', url: '/read/incidents/nope', status, body });

describe('HTTP MCP backend with a fake daemon', () => {
  test('a tool read returns daemon data, not an empty result', async () => {
    const daemon = fakeDaemon();
    const { tools } = await build(daemon.client);
    expect(await tools.listIncidents({ limit: 20 })).toEqual([incident, incident]);
    expect(await tools.listServices()).toEqual([{ name: 'api', status: 'haunting' }]);
    expect(daemon.calls).toContain('/read/incidents');
  });

  test('propose_fix reports the real limit status from the fake daemon', async () => {
    const counters: LimitCounters = {
      openPrsLastHour: 0,
      actionsLast10Min: 0,
      diagnosisLoops: 1,
      llmSpentTodayUsd: 0.25,
    };
    const { tools } = await build(fakeDaemon(snapshot(counters)).client);
    const result = (await tools.proposeFix({ incidentId: 'inc-1', action: 'open_pr' })) as {
      limits: { enforced: boolean; source: string; counters: LimitCounters };
      decision: { reason: string };
    };
    expect(result.limits.enforced).toBe(true);
    expect(result.limits.source).toBe('wired');
    expect(result.limits.counters).toEqual(counters);
    expect(result.decision.reason).toBe('rule:allow-pr');
  });

  test('a limit reached in the daemon blocks the fix', async () => {
    const counters: LimitCounters = {
      openPrsLastHour: 1,
      actionsLast10Min: 0,
      diagnosisLoops: 0,
      llmSpentTodayUsd: 0,
    };
    const { tools } = await build(fakeDaemon(snapshot(counters)).client);
    const result = (await tools.proposeFix({ incidentId: 'inc-1', action: 'open_pr' })) as {
      decision: { reason: string };
    };
    expect(result.decision.reason).toBe('rate_limited');
  });

  test('propose_fix states that unwired counters do not enforce limits', async () => {
    const { tools } = await build(fakeDaemon(snapshot(ZERO_COUNTERS, 'not_wired')).client);
    const result = (await tools.proposeFix({ incidentId: 'inc-1', action: 'open_pr' })) as {
      limits: { enforced: boolean; source: string; reason: string };
    };
    expect(result.limits.enforced).toBe(false);
    expect(result.limits.source).toBe('not_wired');
    expect(result.limits.reason).toContain('not enforced');
  });

  test('a malformed counters body makes the fix unavailable', async () => {
    const malformed = [
      { source: 'wired', counters: { openPrsLastHour: 0, actionsLast10Min: 0 } },
      { source: 'wired', counters: { ...ZERO_COUNTERS, llmSpentTodayUsd: -1 } },
      { source: 'wired', counters: { ...ZERO_COUNTERS, diagnosisLoops: Number.NaN } },
    ];
    await Promise.all(
      malformed.map(async (body) => {
        const { tools } = await build(fakeDaemon(body).client);
        await expect(tools.proposeFix({ incidentId: 'inc-1', action: 'open_pr' })).rejects.toThrow(
          DaemonUnavailableError,
        );
      }),
    );
  });

  test('a 404 with a not_found body means the incident is absent', async () => {
    const client = {
      get: async () => {
        throw httpError(404, { error: 'not_found' });
      },
    };
    const { backend } = await build(client);
    expect(await backend.getIncident('nope')).toBeUndefined();
  });

  test('a 404 without a not_found body is an availability error', async () => {
    const client = {
      get: async () => {
        throw httpError(404, { error: 'unknown_route' });
      },
    };
    const { backend } = await build(client);
    await expect(backend.getIncident('nope')).rejects.toThrow(DaemonUnavailableError);
  });

  test('a normal incident read still returns the daemon record', async () => {
    const { backend } = await build(fakeDaemon().client);
    expect(await backend.getIncident('inc-1')).toEqual(incident);
  });

  test('a token error gets the daemon_auth code and still fails closed', async () => {
    await Promise.all(
      [401, 403].map(async (status) => {
        const client = {
          get: async () => {
            throw httpError(status, { error: 'unauthorized' });
          },
        };
        const { backend } = await build(client);
        await expect(backend.listServices()).rejects.toMatchObject({
          code: 'daemon_auth',
          name: 'DaemonUnavailableError',
        });
      }),
    );
  });

  test('the unavailable path fails closed when the daemon is down', async () => {
    const down = {
      get: async () => {
        throw new HttpNetworkError({
          method: 'GET',
          url: '/read/services',
          cause: new Error('ECONNREFUSED'),
        });
      },
    };
    const { backend, tools } = await build(down);
    await expect(backend.listServices()).rejects.toThrow(DaemonUnavailableError);
    await expect(backend.listIncidents()).rejects.toThrow(DaemonUnavailableError);
    await expect(backend.getCounters()).rejects.toThrow(DaemonUnavailableError);
    await expect(tools.proposeFix({ incidentId: 'inc-1', action: 'open_pr' })).rejects.toThrow(
      DaemonUnavailableError,
    );
  });

  test('malformed read bodies fail closed at the boundary', async () => {
    const cases: Array<{
      path: string;
      body: unknown;
      read: (backend: HttpMcpBackend) => Promise<unknown>;
    }> = [
      { path: '/read/services', body: [{ name: 7 }], read: (backend) => backend.listServices() },
      {
        path: '/read/incidents',
        body: [{ nope: true }],
        read: (backend) => backend.listIncidents(),
      },
      {
        path: '/read/incidents/:id',
        body: { incident: { id: 7 } },
        read: (backend) => backend.getIncident('inc-1'),
      },
      {
        path: '/read/audit',
        body: [{ seq: 'one' }],
        read: (backend) => backend.listAudit({ afterSeq: 0, limit: 10 }),
      },
      {
        path: '/read/audit/verify',
        body: { ok: 'yes', length: 0 },
        read: (backend) => backend.verifyChain(),
      },
      { path: '/read/logs', body: [7], read: (backend) => backend.tailLogs('api', 5) },
      { path: '/read/metrics', body: { value: '1' }, read: (backend) => backend.queryMetric('up') },
    ];
    await Promise.all(
      cases.map(async ({ path, body, read }) => {
        const { backend } = await build(fakeDaemon(undefined, { [path]: body }).client);
        await expect(read(backend)).rejects.toThrow(DaemonUnavailableError);
      }),
    );
  });

  test('verify_audit_chain redacts the parsed chain result', async () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';
    const { tools } = await build(
      fakeDaemon(undefined, {
        '/read/audit/verify': { ok: false, brokenAtSeq: 1, reason: `key ${secret}` },
      }).client,
    );
    const result = (await tools.verifyAuditChain()) as { reason: string };
    expect(result.reason).not.toContain(secret);
    expect(result.reason).toContain('[REDACTED:aws_key]');
  });
});
