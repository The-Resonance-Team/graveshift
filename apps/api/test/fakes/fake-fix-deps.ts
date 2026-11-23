import type {
  BaseSnapshot,
  FixWorkspace,
  GitHubClient,
  RepoPolicy,
  SandboxConfig,
  SourceProvider,
} from '@graveshift/fixer';
import type { PatchGateway, PatchProposal } from '@graveshift/patch';
import { parsePolicy, type Policy } from '@graveshift/policy';

import { FIX_DEPS, type FixDeps } from '../../src/fix/fix.types';

export interface Call {
  method: string;
  args: unknown[];
}

export { FIX_DEPS };

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

const fixPolicy: Policy = parsePolicy({
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
  rules: [{ id: 'allow-pr', action: 'open_pr', effect: 'allow' }],
  default: 'deny',
});

const API_TEXT = 'export const broken = true;\n';
const API_FIXED_TEXT = 'export const ok = true;\n';
const BASE_SHA = 'base-sha';
const BASE_BLOB_SHA = 'blob-base-api';

const snapshot: BaseSnapshot = {
  baseSha: BASE_SHA,
  treeSha: 'base-tree',
  files: [
    {
      path: 'src/api.ts',
      blobSha: BASE_BLOB_SHA,
      bytes: new TextEncoder().encode(API_TEXT),
      text: API_TEXT,
    },
  ],
};

const proposal: PatchProposal = {
  baseSha: BASE_SHA,
  files: [
    {
      path: 'src/api.ts',
      baseBlobSha: BASE_BLOB_SHA,
      content: API_FIXED_TEXT,
      linesChanged: 1,
    },
  ],
};

let recorded: Call[] = [];

export function fixCalls(): Call[] {
  return recorded;
}

// The real FixService runs in e2e; only its outside collaborators are fakes.
export function fakeFixDeps(over: { confidence?: number; throwOnLoad?: boolean } = {}): FixDeps {
  const calls: Call[] = [];
  recorded = calls;
  const push = (method: string, ...args: unknown[]): void => {
    calls.push({ method, args });
  };
  const gateway: PatchGateway = {
    async run(task) {
      push('patch', task);
      return {
        status: 'ok',
        value: proposal,
        model: 'fake-model',
        usage: { in: 0, out: 0 },
        costUsd: 0,
      };
    },
  };
  const source: SourceProvider = {
    async readBase(name, branch) {
      push('readBase', name, branch);
      return snapshot;
    },
    async currentBaseSha(name, branch) {
      push('currentBaseSha', name, branch);
      return BASE_SHA;
    },
  };
  const workspace: FixWorkspace = {
    async verify(_base, patch, sandbox) {
      push('verify', patch, sandbox);
      return {
        ok: true,
        checks: [
          {
            command: ['true'],
            exitCode: 0,
            timedOut: false,
            stdout: '',
            stderr: '',
            stdoutTruncated: false,
            stderrTruncated: false,
          },
        ],
      };
    },
  };
  const client: GitHubClient = {
    async getBaseSha(name, branch) {
      push('getBaseSha', name, branch);
      return BASE_SHA;
    },
    async getCommitTree(name, sha) {
      push('getCommitTree', name, sha);
      return 'base-tree';
    },
    async listTree(name, treeSha) {
      push('listTree', name, treeSha);
      return snapshot.files.map((file) => ({ path: file.path, blobSha: file.blobSha }));
    },
    async getBlobBytes(name, blobSha) {
      push('getBlobBytes', name, blobSha);
      const file = snapshot.files.find((candidate) => candidate.blobSha === blobSha);
      if (file === undefined) throw new Error(`missing blob ${blobSha}`);
      return file.bytes;
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
  const sandbox: SandboxConfig = { commands: [['true']], timeoutMs: 1_000 };
  return {
    policy: fixPolicy,
    repo,
    gateway,
    client,
    source,
    workspace,
    sandbox,
    context: {
      async load() {
        if (over.throwOnLoad) throw new Error('context provider failed');
        return {
          ok: true as const,
          value: {
            confidence: over.confidence ?? 0.95,
            category: 'code_bug',
            signals: ['oom_killed'],
            counters: {
              openPrsLastHour: 0,
              actionsLast10Min: 0,
              diagnosisLoops: 0,
              llmSpentTodayUsd: 0,
            },
          },
        };
      },
    },
    agent: 'Exorcist',
    autoFixEnabled: true,
    now: () => new Date('2026-11-22T00:00:00.000Z'),
    promptTemplate:
      '{{AGENT_NAME}} {{AGENT_ROLE}} {{AGENT_DESCRIPTION}} {{AGENT_PROMPT}} {{MODEL}} {{PROVIDER}} {{DAILY_BUDGET_USD}} {{DIAGNOSIS}} {{RULES}}',
    agentMeta: {
      name: 'Exorcist',
      role: 'exorcist',
      description: 'Proposes a guarded patch.',
      prompt: 'Propose one minimal patch.',
      model: 'test-model',
      provider: '@ai-sdk/anthropic',
      dailyBudgetUsd: 10,
    },
  };
}
