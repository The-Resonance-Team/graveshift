import type { Diagnosis, Incident } from '@graveshift/core';

import type { CheckRun, GitHubClient, PullRequestState } from './client';
import type { RepoPolicy } from './types';

export const repo: RepoPolicy = {
  repo: 'xiro/haunted-candy-shop',
  services: ['api', 'worker'],
  baseBranch: 'main',
  branchPrefix: 'graveshift/',
  draft: true,
  allowedPaths: ['src/**', 'config/**', 'migrations/**', 'test/**'],
  forbiddenPaths: ['.github/**', '**/*.pem', '**/.env*', 'deploy/**', 'policy*.yaml'],
  maxFilesChanged: 5,
  maxLinesChanged: 200,
};

export const incident: Incident = {
  id: 'inc-7f3a9c21-aaaa',
  service: 'api',
  state: 'diagnosed',
  signalIds: ['sig-1'],
  openedAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:01:00.000Z',
};

export const diagnosis: Diagnosis = {
  id: 'dia-1',
  incidentId: incident.id,
  rootCause: 'GET /candies/:id calls toFixed on a null price',
  evidence: [
    {
      ref: 'log:2',
      excerpt: 'TypeError: null is not an object (token=ghp_abcdefghijklmnopqrstuvwxyz0123456789)',
    },
  ],
  confidence: 0.85,
  createdAt: '2026-11-20T10:01:00.000Z',
};

export interface Call {
  method: string;
  args: unknown[];
}

/** The one argument of one recorded call, or a failure that names the missing call. */
export function callArg(calls: Call[], method: string, index: number): unknown {
  const found = calls.find((call) => call.method === method);
  if (found === undefined) throw new Error(`no ${method} call was made`);
  return found.args[index];
}

export function fakeClient(over: { pr?: PullRequestState[]; checks?: CheckRun[][] } = {}) {
  const calls: Call[] = [];
  let pollPr = 0;
  let pollChecks = 0;
  const record =
    <A extends unknown[], R>(method: string, result: (...args: A) => R) =>
    async (...args: A): Promise<Awaited<R>> => {
      calls.push({ method, args });
      return result(...args) as Awaited<R>;
    };
  const client: GitHubClient = {
    getBaseSha: record('getBaseSha', () => 'base-sha'),
    getCommitTree: record('getCommitTree', () => 'base-tree'),
    listTree: record('listTree', () => [
      { path: 'src/app.ts', blobSha: 'blob-base-src-app' },
      { path: 'README.md', blobSha: 'blob-base-readme' },
    ]),
    getBlobBytes: record('getBlobBytes', (_repo: string, blobSha: string) =>
      Buffer.from(`bytes-of-${blobSha}`, 'utf8'),
    ),
    createBlob: record('createBlob', (_repo: string, content: string) => `blob-${content.length}`),
    createTree: record('createTree', () => 'tree-sha'),
    createCommit: record('createCommit', () => 'commit-sha'),
    createRef: record('createRef', () => undefined),
    createPullRequest: record('createPullRequest', () => ({
      number: 42,
      url: 'https://github.com/xiro/haunted-candy-shop/pull/42',
    })),
    addLabels: record('addLabels', () => undefined),
    listCheckRuns: record(
      'listCheckRuns',
      () => over.checks?.[Math.min(pollChecks++, over.checks.length - 1)] ?? [],
    ),
    getPullRequest: record(
      'getPullRequest',
      () =>
        over.pr?.[Math.min(pollPr++, over.pr.length - 1)] ?? {
          state: 'open' as const,
          merged: false,
          headSha: 'commit-sha',
        },
    ),
  };
  return { client, calls };
}

export const file = (path: string, linesChanged = 1) => ({ path, content: 'x', linesChanged });
