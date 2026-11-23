import {
  type BaseSnapshot,
  type CheckOutcome,
  type FixWorkspace,
  type GitHubClient,
  type SandboxConfig,
  type SourceProvider,
  type VerifyResult,
} from '@graveshift/fixer';
import { type Patch, type PatchGateway, type PatchProposal } from '@graveshift/patch';

import { FixService } from './fix.service';
import type { FixContext, FixContextLoad, FixDeps } from './fix.types';
import {
  baseSnapshot,
  goodContext,
  goodProposal,
  NOW,
  policyWith,
  repo,
  sandboxConfig,
  type Call,
} from './fix.test-helpers';

export function fakeGateway(value: PatchProposal | 'unavailable') {
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

export function fakeClient(over: { prError?: Error; liveBaseSha?: string; log?: Call[] } = {}) {
  const calls: Call[] = [];
  const push = (method: string, ...args: unknown[]): void => {
    calls.push({ method, args });
    over.log?.push({ method, args });
  };
  const client: GitHubClient = {
    async getBaseSha(name, branch) {
      push('getBaseSha', name, branch);
      return over.liveBaseSha ?? 'base-sha';
    },
    async getCommitTree(name, sha) {
      push('getCommitTree', name, sha);
      return 'base-tree';
    },
    async listTree(name, treeSha) {
      push('listTree', name, treeSha);
      return baseSnapshot().files.map((f) => ({ path: f.path, blobSha: f.blobSha }));
    },
    async getBlobBytes(name, blobSha) {
      push('getBlobBytes', name, blobSha);
      const file = baseSnapshot().files.find((candidate) => candidate.blobSha === blobSha);
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

export function fakeSource(over: { snapshot?: BaseSnapshot; error?: Error; log?: Call[] } = {}) {
  const calls: Call[] = [];
  const provider: SourceProvider = {
    async readBase(name, branch) {
      const entry = { method: 'readBase', args: [name, branch] };
      calls.push(entry);
      over.log?.push({ method: `source.${entry.method}`, args: entry.args });
      if (over.error) throw over.error;
      return over.snapshot ?? baseSnapshot();
    },
    async currentBaseSha(name, branch) {
      const entry = { method: 'currentBaseSha', args: [name, branch] };
      calls.push(entry);
      over.log?.push({ method: `source.${entry.method}`, args: entry.args });
      return (over.snapshot ?? baseSnapshot()).baseSha;
    },
  };
  return { provider, calls };
}

export function fakeWorkspace(over: { fail?: string; checks?: CheckOutcome[] } = {}) {
  const calls: Array<{ base: BaseSnapshot; patch: Patch; sandbox: SandboxConfig }> = [];
  const workspace: FixWorkspace = {
    async verify(base, patch, config): Promise<VerifyResult> {
      calls.push({ base, patch, sandbox: config });
      if (over.fail !== undefined) {
        return { ok: false, reason: over.fail, checks: over.checks ?? [] };
      }
      return {
        ok: true,
        checks: over.checks ?? [
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
  return { workspace, calls };
}

export function serviceWith(
  over: {
    allow?: boolean;
    patch?: PatchProposal | 'unavailable';
    context?: FixContext | 'unavailable' | 'malformed';
    prError?: Error;
    autoFixEnabled?: boolean;
    sourceError?: Error;
    snapshot?: BaseSnapshot;
    checksFail?: string;
    liveBaseSha?: string;
    /** Overrides the services the repository config maps, for the policy gate. */
    services?: string[];
  } = {},
) {
  const external: Call[] = [];
  const gatewayFake = fakeGateway(over.patch === undefined ? goodProposal : over.patch);
  const clientFake = fakeClient({
    ...(over.prError === undefined ? {} : { prError: over.prError }),
    ...(over.liveBaseSha === undefined ? {} : { liveBaseSha: over.liveBaseSha }),
    log: external,
  });
  const sourceFake = fakeSource({
    ...(over.sourceError === undefined ? {} : { error: over.sourceError }),
    ...(over.snapshot === undefined ? {} : { snapshot: over.snapshot }),
    log: external,
  });
  const workspaceFake = fakeWorkspace(
    over.checksFail === undefined ? {} : { fail: over.checksFail },
  );
  const chosen = over.context === undefined ? goodContext : over.context;
  const contextCalls: Call[] = [];
  const load = async (): Promise<FixContextLoad> => {
    contextCalls.push({ method: 'load', args: [] });
    if (chosen === 'unavailable') return { ok: false, reason: 'diagnosis_context_unavailable' };
    if (chosen === 'malformed') return { ok: true, value: { ...goodContext, confidence: 9 } };
    return { ok: true, value: chosen };
  };
  const deps: FixDeps = {
    policy: policyWith(over.allow !== false),
    repo: over.services === undefined ? repo : { ...repo, services: over.services },
    gateway: gatewayFake.gateway,
    client: clientFake.client,
    source: sourceFake.provider,
    workspace: workspaceFake.workspace,
    sandbox: sandboxConfig,
    context: { load },
    agent: 'Exorcist',
    autoFixEnabled: over.autoFixEnabled ?? true,
    now: () => new Date(NOW),
    promptTemplate: [
      'You are {{AGENT_NAME}}, the {{AGENT_ROLE}} Agent.',
      '{{AGENT_DESCRIPTION}}',
      '{{AGENT_PROMPT}}',
      '{{DIAGNOSIS}}',
      '{{RULES}}',
      '{{MODEL}} {{PROVIDER}} {{DAILY_BUDGET_USD}}',
    ].join('\n'),
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
  return {
    service: new FixService(deps),
    gatewayCalls: gatewayFake.calls,
    contextCalls,
    sourceCalls: sourceFake.calls,
    workspaceCalls: workspaceFake.calls,
    // Every outside call, recorded in the real order: reads first, then pushes.
    calls: external,
    client: clientFake.client,
  };
}
