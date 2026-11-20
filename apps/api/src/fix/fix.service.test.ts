import { createSubtasks, type WorkItem } from '@graveshift/core';
import { type GitHubClient, type RepoPolicy } from '@graveshift/fixer';
import { type Patch, type PatchGateway } from '@graveshift/patch';
import { parsePolicy, type Policy } from '@graveshift/policy';
import { describe, expect, test } from 'bun:test';

import { FixService } from './fix.service';
import type { FixDeps } from './fix.types';

interface Call {
  method: string;
  args: unknown[];
}

const repo: RepoPolicy = {
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

const patch: Patch = {
  files: [{ path: 'src/api.ts', content: 'export const ok = true;\n', linesChanged: 1 }],
};

const baseItem: WorkItem = {
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
};

function policyWith(allow: boolean): Policy {
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
    llm: { minConfidenceForPr: 0, minConfidenceForAction: 0 },
    github: { repos: [repo] },
    rules: allow ? [{ id: 'allow-pr', action: 'open_pr', effect: 'allow' }] : [],
    default: 'deny',
  });
}

function fakeGateway(value: Patch | 'unavailable') {
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

function fakeClient() {
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

function serviceWith(over: { allow?: boolean; patch?: Patch | 'unavailable' } = {}) {
  const gatewayFake = fakeGateway(over.patch === undefined ? patch : over.patch);
  const clientFake = fakeClient();
  const deps: FixDeps = {
    policy: policyWith(over.allow !== false),
    repo,
    gateway: gatewayFake.gateway,
    client: clientFake.client,
    agent: 'SRE Bot',
  };
  return { service: new FixService(deps), gatewayCalls: gatewayFake.calls, ...clientFake };
}

describe('fix use case', () => {
  test('auto-fix is allowed only when client config sets autoFixAllowed', async () => {
    const { service, gatewayCalls, calls } = serviceWith();
    const result = await service.autoFix({ ...baseItem, autoFixAllowed: true });
    expect(result.ok).toBe(true);
    expect(result.trigger).toBe('auto_fix');
    expect(result.effect).toBe('allow');
    expect(result.pr?.number).toBe(7);
    expect(gatewayCalls).toHaveLength(1);
    expect(calls.some((call) => call.method === 'createPullRequest')).toBe(true);
  });

  test('auto-fix disabled uses Fix now', async () => {
    const { service, gatewayCalls, calls } = serviceWith();
    const disabled = { ...baseItem, autoFixAllowed: false };
    const blocked = await service.autoFix(disabled);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe('auto_fix_disabled');
    expect(gatewayCalls).toHaveLength(0);

    const fixed = await service.fixNow(disabled);
    expect(fixed.ok).toBe(true);
    expect(fixed.trigger).toBe('fix_now');
    expect(calls.some((call) => call.method === 'createPullRequest')).toBe(true);
  });

  test('Fix now promotes queue priority', async () => {
    const { service } = serviceWith();
    const item = { ...baseItem, autoFixAllowed: false };
    const result = await service.fixNow(item);
    expect(result.item.fixPriority).toBe(0);
    expect(item.fixPriority).toBe(100);
    expect(result.trigger).toBe('fix_now');
  });

  test('policy deny blocks the patch and the pull request', async () => {
    const { service, gatewayCalls, calls } = serviceWith({ allow: false });
    const result = await service.fixNow(baseItem);
    expect(result.ok).toBe(false);
    expect(result.effect).toBe('deny');
    expect(gatewayCalls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  test('a guarded patch reaches createPullRequest with draft true', async () => {
    const { service, calls } = serviceWith();
    const result = await service.fixNow(baseItem);
    expect(result.ok).toBe(true);
    const call = calls.find((entry) => entry.method === 'createPullRequest');
    if (call === undefined) throw new Error('expected a createPullRequest call');
    expect((call.args[1] as { draft: boolean }).draft).toBe(true);
  });

  test('an unguarded patch never reaches the client', async () => {
    const unsafe: Patch = {
      files: [{ path: 'policy.yaml', content: 'x', linesChanged: 1 }],
    };
    const { service, calls } = serviceWith({ patch: unsafe });
    const result = await service.fixNow(baseItem);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('forbidden path');
    expect(calls).toHaveLength(0);
  });

  test('no merge method exists or is called', async () => {
    const { service, client, calls } = serviceWith();
    await service.fixNow(baseItem);
    expect('merge' in client).toBe(false);
    expect('mergePullRequest' in client).toBe(false);
    expect(calls.some((call) => call.method.toLowerCase().includes('merge'))).toBe(false);
    // Compile-time guard. Adding a merge method makes this expected error disappear and fails the check.
    // @ts-expect-error
    void client.mergePullRequest;
  });
});
