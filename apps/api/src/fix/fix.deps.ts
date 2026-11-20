import { GitHubApiError, type GitHubClient, type RepoPolicy } from '@graveshift/fixer';
import type { PatchGateway } from '@graveshift/patch';
import { loadPolicy, parsePolicy, type Policy } from '@graveshift/policy';

import type { FixDeps } from './fix.types';

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

export async function createFixDeps(): Promise<FixDeps> {
  const path = process.env.POLICY_PATH;
  const policy = path ? await loadPolicy(path) : DEFAULT_POLICY;
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
    agent: 'SRE Bot',
    ...(envMode === undefined ? {} : { envMode }),
  };
}
