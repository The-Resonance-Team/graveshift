import { getHttpClientToken, HttpClient } from '@nestjs/http-client';
import { Test } from '@nestjs/testing';
import type { CounterSnapshot, LimitCounters } from '@graveshift/core';
import { type SharedPolicyContext } from '@graveshift/core/policy-context';
import { RecordedHauntingSchema, type RecordedHaunting } from '@graveshift/core/recorded';
import type { CollectorReads } from '@graveshift/integrations';
import { parsePolicy } from '@graveshift/policy';

import type { PrivateApi } from '../../../daemon/src/api-client';
import { HttpFailure } from '../../../daemon/src/private-http';
import { createReadHandler } from '../../../daemon/src/read-handler';
import { createReadRuntime, type ReadRuntime } from '../../../daemon/src/reads';
import { AuditRepo } from '../audit/audit.repo';
import { AUDIT_SINK, AUDIT_READER } from '../audit/audit.sink';
import { openTestDatabase } from '../../test/database/fixtures';
import { HttpMcpBackend } from './mcp.backend';
import { McpProjectContext } from './mcp-project-context';
import { McpTools } from './mcp.tools';
import { MCP_AUDIT_WRITER, MCP_BACKEND, MCP_ENV_MODE, MCP_POLICY } from './mcp.types';

export const DAEMON_CLIENT = getHttpClientToken('daemon-read');

/** Recorded data kept as data only: no in-memory backend stands in for the real one. */
export const SECRET = 'AKIAIOSFODNN7EXAMPLE';

const at = '2026-01-01T00:00:00.000Z';

export const RECORDED_FIXTURE = RecordedHauntingSchema.parse({
  incident: {
    id: 'inc1',
    service: 'api',
    state: 'resolved',
    signalIds: ['detection-1'],
    openedAt: at,
    updatedAt: at,
    resolvedAt: at,
    diagnosis: {
      id: 'diagnosis-1',
      incidentId: 'inc1',
      confidence: 0.9,
      rootCause: `null deref with key ${SECRET}`,
      evidence: [{ ref: 'detection-1', excerpt: `observed ${SECRET}` }],
      createdAt: at,
    },
  },
  severity: 'critical',
  category: 'code_bug',
  detections: [
    {
      id: 'detection-1',
      projectId: 'project-1',
      eventId: 'event-1',
      traceId: 'trace-1',
      rule: 'runtime.restart-loop',
      service: 'api',
      severity: 'critical',
      fingerprint: 'api:crash',
      message: `observed ${SECRET}`,
      observedAt: at,
    },
  ],
  timeline: [{ at, type: 'opened', detail: 'Recorded fixture' }],
});

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

export const facts: SharedPolicyContext = {
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

const READ_TOKEN = 'graveshift-test-daemon-read-token';
const READ_HOST = '127.0.0.1';

/** Seeded application state for the real handler. No response body is stubbed at the client. */
export interface DaemonSeed {
  view?: RecordedHaunting;
  facts?: SharedPolicyContext;
  logs?: string[];
  metric?: number | null;
  serviceStatus?: string;
  counters?: CounterSnapshot;
  rawCounters?: unknown;
  badContext?: unknown;
  malformed?: unknown;
  missingIncident?: boolean;
  failIncident?: boolean;
  bearer?: string;
  projectIds?: readonly string[];
}

export interface DaemonHarness {
  client: HttpClient;
  calls: Array<{ url: string; body: unknown }>;
  reseed: (next: DaemonSeed) => void;
  stop: () => void;
}

/** Serves the daemon's real read handler on a bounded loopback listener at port 0. */
export const startDaemon = (initial: DaemonSeed = {}): DaemonHarness => {
  const current: DaemonSeed = { ...initial };
  const api: PrivateApi = {
    get: async (_path, schema) => schema.parse({}),
    post: async (path, _body, schema) => {
      const view = current.view ?? haunting;
      if (path === '/internal/hauntings/list') return schema.parse([view]);
      if (path === '/internal/hauntings/get') {
        if (current.missingIncident) throw new HttpFailure(404, 'incident not found');
        return schema.parse(view);
      }
      if (path === '/internal/context') return schema.parse(current.facts ?? facts);
      throw new HttpFailure(404, 'private api path');
    },
  };
  const source: CollectorReads = {
    listServices: async () => [{ name: 'api', runtime: 'docker' }],
    tailLogs: async () => current.logs ?? ['line one', 'line two'],
    getHealth: async () => ({ service: 'api', status: 'healthy', checkedAt: at }),
  };
  const metrics = {
    watcher: async () => null,
    query: async () => current.metric ?? 0.2,
  };
  const runtime = createReadRuntime({ api, sources: [source], metrics, metricJobs: ['api'] });
  // Seeded runtime values only: the read handler and the HTTP hop stay real.
  // Boundary: an unknown seed is injected as the declared wire value on purpose.
  const seeded = <Value>(real: () => Promise<Value>): Promise<Value> =>
    current.malformed === undefined ? real() : Promise.resolve(current.malformed as Value);
  const reads: ReadRuntime = {
    services: (id) =>
      current.serviceStatus === undefined
        ? seeded(() => runtime.services(id))
        : Promise.resolve([{ name: 'api', status: current.serviceStatus }]),
    incidents: (id) => seeded(() => runtime.incidents(id)),
    incident: (id, ref) =>
      current.failIncident
        ? Promise.reject(new Error('seeded daemon fault'))
        : seeded(() => runtime.incident(id, ref)),
    logs: (service, lines) => seeded(() => runtime.logs(service, lines)),
    metric: (promql) => seeded(() => runtime.metric(promql)),
    context: (id, ref) =>
      current.badContext === undefined
        ? seeded(() => runtime.context(id, ref))
        : // Boundary: malformed fixture facts enter the client's schema validation.
          Promise.resolve(current.badContext as SharedPolicyContext),
    counters: (id, ref) =>
      current.rawCounters === undefined
        ? current.counters === undefined
          ? seeded(() => runtime.counters(id, ref))
          : Promise.resolve(current.counters)
        : // Boundary: malformed counters enter the client's schema validation.
          Promise.resolve(current.rawCounters as CounterSnapshot),
  };
  const calls: DaemonHarness['calls'] = [];
  const handler = createReadHandler({
    reads,
    projectIds: initial.projectIds ?? ['project-1', 'project-2'],
    token: initial.bearer ?? READ_TOKEN,
    timeoutMs: 1000,
    maxBytes: 65_536,
  });
  const listener = Bun.serve({
    port: 0,
    hostname: READ_HOST,
    fetch: async (request) => {
      if (request.method === 'POST') {
        calls.push({
          url: new URL(request.url).pathname,
          body: await request.clone().json(),
        });
      }
      return handler(request);
    },
  });
  return {
    client: new HttpClient({
      baseUrl: `http://${READ_HOST}:${listener.port}`,
      headers: { authorization: `Bearer ${READ_TOKEN}` },
      timeout: '2s',
      retry: false,
    }),
    calls,
    reseed: (next) => {
      // Boundary: reseed removes only keys declared by DaemonSeed.
      for (const key of Object.keys(current) as Array<keyof DaemonSeed>) delete current[key];
      Object.assign(current, next);
    },
    stop: () => listener.stop(true),
  };
};

/** The guarded local database behind the real audit seams. */
export async function openAuditRepo() {
  const db = await openTestDatabase();
  return { db, audit: new AuditRepo(db), close: () => db.onModuleDestroy() };
}

export const build = async (client: HttpClient, audit: AuditRepo, projectId = 'project-1') => {
  const moduleRef = await Test.createTestingModule({
    providers: [
      HttpMcpBackend,
      McpTools,
      { provide: MCP_BACKEND, useClass: HttpMcpBackend },
      { provide: MCP_AUDIT_WRITER, useExisting: MCP_BACKEND },
      { provide: DAEMON_CLIENT, useValue: client },
      { provide: AUDIT_SINK, useValue: audit },
      { provide: AUDIT_READER, useValue: audit },
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
