import type { Diagnosis, Incident } from '@graveshift/core';

import type { GitHubClient } from './client';
import { publicationText, type OpenDraftPrInput, writeDraft } from './open-pr';
import type { PrRef, RepoPolicy } from './types';

export const TEST_BASE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const TEST_BLOB_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

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

export function fakeClient() {
  const calls: Call[] = [];
  const record =
    <A extends unknown[], R>(method: string, result: (...args: A) => R) =>
    async (...args: A): Promise<R> => {
      calls.push({ method, args });
      return result(...args);
    };
  const client: GitHubClient = {
    getCommitTree: record('getCommitTree', () => 'base-tree'),
    getTree: record('getTree', () => []),
    readBlob: record('readBlob', () => ''),
    getExistingDraft: record('getExistingDraft', () => undefined),
    createBlob: record('createBlob', (_repo: string, content: string) => `blob-${content.length}`),
    createTree: record('createTree', () => 'tree-sha'),
    createCommit: record('createCommit', () => 'commit-sha'),
    createRef: record('createRef', () => undefined),
    createPullRequest: record('createPullRequest', () => ({
      number: 42,
      url: 'https://github.com/xiro/haunted-candy-shop/pull/42',
    })),
    addLabels: record('addLabels', () => undefined),
  };
  return { client, calls };
}

/** Drives the production text and write steps with a base pinned by the test. */
export async function publishPinned(input: OpenDraftPrInput): Promise<PrRef> {
  return writeDraft(input, publicationText(input), TEST_BASE_SHA, 'base-tree');
}

export const file = (
  path: string,
  linesChanged = 1,
  baseBlobSha: string | null = TEST_BLOB_SHA,
) => ({
  path,
  content: 'x',
  linesChanged,
  baseBlobSha,
});
