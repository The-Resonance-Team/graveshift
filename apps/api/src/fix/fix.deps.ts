import { GraveshiftError } from '@graveshift/core';
import { GitHubApiError, type GitHubClient, type RepoPolicy } from '@graveshift/fixer';
import type { PatchGateway } from '@graveshift/patch';
import { loadPolicy, parsePolicy, type Policy } from '@graveshift/policy';

import type { FixContextProvider, FixDeps } from './fix.types';

export class FixConfigError extends GraveshiftError<'FIX_CONFIG_ERROR'> {
  constructor(message: string) {
    super('FIX_CONFIG_ERROR', message);
  }
}

// The v2 API has no real model or GitHub wiring. A fix attempt stops at the guard
// instead of calling a live endpoint. Tests inject their own deps.
const DEFAULT_POLICY: Policy = parsePolicy({
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

// Placeholder only. It maps no service and allows no path, so a fix fails closed
// until a real policy supplies a repo. It is never used to open a PR.
const DEFAULT_REPO: RepoPolicy = {
  repo: 'unconfigured/unconfigured',
  services: [],
  baseBranch: 'main',
  branchPrefix: 'graveshift/',
  draft: true,
  allowedPaths: [],
  forbiddenPaths: [],
  maxFilesChanged: 5,
  maxLinesChanged: 200,
};

const unavailableGateway: PatchGateway = {
  async run() {
    return { status: 'unavailable' };
  },
};

const reject = (): never => {
  throw new GitHubApiError('no GitHub client is configured');
};

const unavailableClient: GitHubClient = {
  getBaseSha: reject,
  getCommitTree: reject,
  createBlob: reject,
  createTree: reject,
  createCommit: reject,
  createRef: reject,
  createPullRequest: reject,
  addLabels: reject,
  listCheckRuns: reject,
  getPullRequest: reject,
};

// No daemon read API exists, so no confidence, category, signal or counter is available.
const unavailableContext: FixContextProvider = {
  async load() {
    return { ok: false, reason: 'diagnosis_context_unavailable' };
  },
};

export async function createFixDeps(): Promise<FixDeps> {
  const path = process.env.POLICY_PATH;
  let policy: Policy;
  if (path) {
    try {
      policy = await loadPolicy(path);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new FixConfigError(`Cannot read policy at ${path}: ${detail}`);
    }
  } else {
    policy = DEFAULT_POLICY;
  }
  const repo =
    policy.github.repos.find((candidate) => candidate.services.includes('api')) ??
    policy.github.repos[0] ??
    DEFAULT_REPO;
  const envMode = process.env.GRAVESHIFT_MODE;
  return {
    policy,
    repo,
    gateway: unavailableGateway,
    client: unavailableClient,
    context: unavailableContext,
    agent: 'SRE Bot',
    ...(envMode === undefined ? {} : { envMode }),
  };
}
