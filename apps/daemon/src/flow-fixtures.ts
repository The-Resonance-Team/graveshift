import { AgentConfigSchema, type AgentConfig } from '@graveshift/agents';
import {
  createSubtasks,
  type Diagnosis,
  type EventEnvelope,
  type WorkItem,
} from '@graveshift/core';
import { PolicySchema } from '@graveshift/policy';

import { withAuditScope } from './audit';
import type { FixContext } from './fix-context';

export const at = '2026-11-21T10:00:00.000Z';
export const caller = { projectId: 'project-1', actor: 'person-1', commandId: 'command-1' };

/**
 * Binds the authenticated audit scope a real Work command carries, so a test can call a fix or
 * model seam directly. Production binds it once in `createWorkCommands`.
 */
export function withFixAuditScope<Value>(work: () => Promise<Value>): Promise<Value> {
  return withAuditScope({ projectId: caller.projectId, actor: caller.actor }, work);
}
export const envelope: EventEnvelope = {
  id: 'event-one',
  projectId: caller.projectId,
  source: 'collector.docker',
  service: 'checkout',
  type: 'runtime.oom',
  severity: 'critical',
  observedAt: at,
  traceId: 'trace-one',
  fingerprint: 'checkout:oom',
  payload: { message: 'Out of memory' },
};
export const pr = {
  repo: 'team/grave',
  number: 7,
  url: 'https://github.com/team/grave/pull/7',
  branch: 'refs/heads/fix/work-1',
  headSha: 'head-1',
};
export const diagnosis: Diagnosis = {
  id: 'diagnosis-1',
  incidentId: 'incident-1',
  rootCause: 'A verified defect',
  evidence: [{ ref: 'signal:1', excerpt: 'oom' }],
  confidence: 0.95,
  createdAt: at,
};

export function agent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return AgentConfigSchema.parse({
    name: 'Assigned Agent',
    slug: 'assigned-agent',
    role: 'sre',
    description: 'Fix defects',
    prompt: 'Fix the verified defect',
    params: [],
    provider: '@ai-sdk/google',
    model: 'recorded-model',
    baseUrl: 'https://models.example.test/v1',
    apiKeyEnv: 'GRAVESHIFT_RECORDING_KEY',
    allowedTools: [],
    dailyBudgetUsd: 10,
    autoFix: false,
    ...overrides,
  });
}

export function item(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'work-1',
    title: 'A verified incident',
    description: 'Other Agent keyword',
    successCriteria: [],
    subtasks: createSubtasks([]),
    status: 'todo',
    priority: 'high',
    assignee: 'needs_agent_Assigned Agent',
    reporter: 'wraith',
    startDate: null,
    dueDate: null,
    sprint: null,
    parent: null,
    labels: [],
    team: 'sre',
    watchers: [],
    severity: 'critical',
    service: 'checkout',
    diagnosisRef: diagnosis.id,
    fixPriority: 100,
    draftPr: null,
    ...overrides,
  };
}

export const policy = PolicySchema.parse({
  version: 1,
  mode: 'propose',
  approvers: { discordUserIds: [], discordRoleIds: [] },
  limits: {
    maxOpenPrsPerHour: 10,
    maxActionsPerServicePer10Min: 10,
    maxDiagnosisLoops: 10,
    llmDailyBudgetUsd: 10,
  },
  llm: { minConfidenceForPr: 0.8, minConfidenceForAction: 0.9 },
  github: {
    repos: [
      {
        repo: 'team/grave',
        services: ['checkout'],
        baseBranch: 'main',
        branchPrefix: 'fix/',
        draft: true,
        allowedPaths: ['src/**'],
        forbiddenPaths: [],
        maxFilesChanged: 3,
        maxLinesChanged: 100,
      },
    ],
  },
  rules: [{ id: 'fix', action: 'open_pr', when: { services: ['checkout'] }, effect: 'allow' }],
  default: 'deny',
});

export function context(): FixContext {
  const repo = policy.github.repos[0];
  if (repo === undefined) throw new Error('Missing fixture repository');
  return {
    diagnosis,
    category: 'code_bug',
    repo,
    incident: {
      id: diagnosis.incidentId,
      service: 'checkout',
      state: 'diagnosed',
      signalIds: ['signal-1'],
      diagnosis,
      openedAt: at,
      updatedAt: at,
    },
    policy: {
      service: 'checkout',
      category: 'code_bug',
      signals: ['runtime.oom'],
      confidence: diagnosis.confidence,
      counters: { openPrsLastHour: 0, actionsLast10Min: 0, diagnosisLoops: 1, llmSpentTodayUsd: 0 },
    },
  };
}
