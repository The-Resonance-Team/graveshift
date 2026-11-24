import { getHttpClientToken, HttpResponseError } from '@nestjs/http-client';
import { Test } from '@nestjs/testing';
import type { AuditEntry, CounterSnapshot, LimitCounters } from '@graveshift/core';
import { parsePolicy } from '@graveshift/policy';

import { AUDIT_SINK, AUDIT_READER, type AuditReader } from '../audit/audit.sink';
import type { VerifyResult } from '../audit/audit.types';
import { RECORDED_FIXTURE } from '../../test/fakes/fake-mcp-backend';
import { HttpMcpBackend } from './mcp.backend';
import { McpProjectContext } from './mcp-project-context';
import { McpTools } from './mcp.tools';
import { MCP_AUDIT_WRITER, MCP_BACKEND, MCP_ENV_MODE, MCP_POLICY } from './mcp.types';

export const DAEMON_CLIENT = getHttpClientToken('daemon-read');

export const ZERO_COUNTERS: LimitCounters = {
  openPrsLastHour: 0,
  actionsLast10Min: 0,
  diagnosisLoops: 0,
  llmSpentTodayUsd: 0,
};

export const snapshot = (
  counters: LimitCounters,
  source: 'wired' | 'not_wired' = 'wired',
): CounterSnapshot => ({
  source,
  counters,
});

/** A recorded Haunting without a recognized secret, so reads compare exactly. */
export const haunting = (() => {
  const view = structuredClone(RECORDED_FIXTURE);
  view.detections = view.detections.map((detection) => ({
    ...detection,
    message: 'observed signal',
  }));
  if (view.incident.diagnosis !== undefined) {
    view.incident.diagnosis = {
      ...view.incident.diagnosis,
      rootCause: 'null deref',
      evidence: view.incident.diagnosis.evidence.map((entry) => ({
        ...entry,
        excerpt: 'observed signal',
      })),
    };
  }
  return view;
})();

export const facts = {
  service: 'api',
  category: 'code_bug',
  confidence: 0.9,
  signals: ['runtime.restart-loop'],
  counters: ZERO_COUNTERS,
};

export const policy = parsePolicy({
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

/** The one daemon read surface: POST commands under /internal/read. */
export const fakeDaemon = (overrides: Record<string, unknown> = {}) => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const replies: Record<string, unknown> = {
    '/internal/read/services': [{ name: 'api', status: 'haunting' }],
    '/internal/read/incidents': [haunting],
    '/internal/read/incident': haunting,
    '/internal/read/counters': snapshot(ZERO_COUNTERS),
    '/internal/read/context': facts,
    '/internal/read/logs': ['line one', 'line two'],
    '/internal/read/metric': 1,
    ...overrides,
  };
  return {
    calls,
    client: {
      post: async (url: string, options: { json: unknown }) => {
        calls.push({ url, body: options.json });
        if (!(url in replies)) throw new Error(`unexpected path ${url}`);
        const data = replies[url];
        if (data instanceof Error) throw data;
        return { data };
      },
    },
  };
};

export const fakeAuditReader = (
  entries: AuditEntry[] = [],
  verify: VerifyResult = { ok: true, length: 0 },
): AuditReader => ({
  list: async () => entries,
  verifyChain: async () => verify,
  policyUsage: async () => ({
    actionsLast10Min: 0,
    diagnosisLoops: 0,
    llmSpentTodayUsd: 0,
  }),
});

export const build = async (
  client: unknown,
  reader: AuditReader = fakeAuditReader(),
  projectId = 'project-1',
) => {
  const moduleRef = await Test.createTestingModule({
    providers: [
      HttpMcpBackend,
      McpTools,
      { provide: MCP_BACKEND, useClass: HttpMcpBackend },
      { provide: MCP_AUDIT_WRITER, useExisting: MCP_BACKEND },
      { provide: DAEMON_CLIENT, useValue: client },
      { provide: AUDIT_SINK, useValue: { append: async () => ({}) } },
      { provide: AUDIT_READER, useValue: reader },
      {
        provide: McpProjectContext,
        useValue: {
          projectId,
          require: () => {
            if (projectId === undefined) throw new Error('An authenticated Project is required');
            return projectId;
          },
        },
      },
      { provide: MCP_POLICY, useValue: policy },
      { provide: MCP_ENV_MODE, useValue: 'production' },
    ],
  }).compile();
  return {
    backend: moduleRef.get(HttpMcpBackend),
    tools: moduleRef.get(McpTools),
  };
};

export const httpError = (status: number, body: unknown) =>
  new HttpResponseError({ method: 'POST', url: '/internal/read/incident', status, body });
