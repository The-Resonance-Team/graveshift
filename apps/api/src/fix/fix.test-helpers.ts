import { createSubtasks, type WorkItem } from '@graveshift/core';
import { type GitHubClient, type RepoPolicy } from '@graveshift/fixer';
import { type Patch, type PatchGateway } from '@graveshift/patch';
import { parsePolicy, type Policy } from '@graveshift/policy';

import { FixService } from './fix.service';
import type { FixContext, FixContextLoad, FixDeps } from './fix.types';

export interface Call {
  method: string;
  args: unknown[];
}

export const repo: RepoPolicy = {
  repo: 'xiro/haunted-candy-shop',
  services: ['api'],
  baseBranch: 'main',
  branchPrefix: 'graveshift/',
  draft: true,
  allowedPaths: ['src/**'],
  forbiddenPaths: ['policy*.yaml'],
  maxFilesChanged: 5,
  maxLinesChanged: 200,
};

export const patch: Patch = {
  files: [{ path: 'src/api.ts', content: 'export const ok = true;\n', linesChanged: 1 }],
};

export const baseItem: WorkItem = {
  id: 'wi-1',
  title: 'Fix OOM on api',
  description: 'The api grave was drained by a leech.',
  successCriteria: [],
  subtasks: createSubtasks([]),
  status: 'todo',
  priority: 'high',
  assignee: 'needs_human',
  reporter: 'wraith',
  startDate: null,
  dueDate: null,
  sprint: null,
  parent: null,
  labels: [],
  team: 'sre',
  watchers: [],
  severity: 'critical',
  service: 'api',
  diagnosisRef: 'diag-1',
  autoFixAllowed: true,
  fixPriority: 100,
  draftPr: null,
};

export const goodContext: FixContext = {
  confidence: 0.95,
  category: 'code_bug',
  signals: ['oom_killed'],
  counters: {
    openPrsLastHour: 0,
    actionsLast10Min: 0,
    diagnosisLoops: 0,
    llmSpentTodayUsd: 0,
  },
};

export function policyWith(allow: boolean): Policy {
  return parsePolicy({
    version: 1,
    mode: 'act',
    approvers: { discordUserIds: [], discordRoleIds: [] },
    limits: {
      maxOpenPrsPerHour: 10,
      maxActionsPerServicePer10Min: 10,
      maxDiagnosisLoops: 10,
      llmDailyBudgetUsd: 100,
    },
    llm: { minConfidenceForPr: 0.6, minConfidenceForAction: 0.75 },
    github: { repos: [repo] },
    rules: allow ? [{ id: 'allow-pr', action: 'open_pr', effect: 'allow' }] : [],
    default: 'deny',
  });
}

export function fakeGateway(value: Patch | 'unavailable') {
  const calls: Array<Parameters<PatchGateway['run']>[0]> = [];
  const gateway: PatchGateway = {
    async run(task) {
      calls.push(task);
      if (value === 'unavailable') return { status: 'unavailable' };
      return { status: 'ok', value, model: 'fake-model', usage: { in: 0, out: 0 }, costUsd: 0 };
    },
  };
  return { gateway, calls };
}

export function fakeClient(over: { prError?: Error } = {}) {
  const calls: Call[] = [];
  const push = (method: string, ...args: unknown[]): void => {
    calls.push({ method, args });
  };
  const client: GitHubClient = {
    async getBaseSha(name, branch) {
      push('getBaseSha', name, branch);
      return 'base-sha';
    },
    async getCommitTree(name, sha) {
      push('getCommitTree', name, sha);
      return 'base-tree';
    },
    async createBlob(name, content) {
      push('createBlob', name, content);
      return 'blob-sha';
    },
    async createTree(name, base, entries) {
      push('createTree', name, base, entries);
      return 'tree-sha';
    },
    async createCommit(name, message, tree, parent) {
      push('createCommit', name, message, tree, parent);
      return 'commit-sha';
    },
    async createRef(name, ref, sha) {
      push('createRef', name, ref, sha);
    },
    async createPullRequest(name, pr) {
      push('createPullRequest', name, pr);
      if (over.prError) throw over.prError;
      return { number: 7, url: 'https://github.test/xiro/haunted-candy-shop/pull/7' };
    },
    async addLabels(name, number, labels) {
      push('addLabels', name, number, labels);
    },
    async listCheckRuns(name, sha) {
      push('listCheckRuns', name, sha);
      return [];
    },
    async getPullRequest(name, number) {
      push('getPullRequest', name, number);
      return { state: 'open', merged: false, headSha: 'commit-sha' };
    },
  };
  return { client, calls };
}

export function serviceWith(
  over: {
    allow?: boolean;
    patch?: Patch | 'unavailable';
    context?: FixContext | 'unavailable' | 'malformed';
    prError?: Error;
  } = {},
) {
  const gatewayFake = fakeGateway(over.patch === undefined ? patch : over.patch);
  const clientFake = fakeClient(over.prError === undefined ? {} : { prError: over.prError });
  const chosen = over.context === undefined ? goodContext : over.context;
  const load = async (): Promise<FixContextLoad> => {
    if (chosen === 'unavailable') return { ok: false, reason: 'diagnosis_context_unavailable' };
    if (chosen === 'malformed') return { ok: true, value: { ...goodContext, confidence: 9 } };
    return { ok: true, value: chosen };
  };
  const deps: FixDeps = {
    policy: policyWith(over.allow !== false),
    repo,
    gateway: gatewayFake.gateway,
    client: clientFake.client,
    context: { load },
    agent: 'SRE Bot',
  };
  return { service: new FixService(deps), gatewayCalls: gatewayFake.calls, ...clientFake };
}
