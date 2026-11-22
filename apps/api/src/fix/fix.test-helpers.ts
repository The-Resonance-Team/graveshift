import { createSubtasks, type WorkItem } from '@graveshift/core';
import type { BaseSnapshot, RepoPolicy, SandboxConfig } from '@graveshift/fixer';
import { GIT_EMPTY_BLOB_SHA, type PatchProposal } from '@graveshift/patch';
import { parsePolicy, type Policy } from '@graveshift/policy';

import type { FixContext } from './fix.types';

/** A new file in a proposal names this git empty-blob SHA. */
export const emptyBlob = GIT_EMPTY_BLOB_SHA;

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

export const NOW = new Date('2026-11-22T00:00:00.000Z');

export const sandboxConfig: SandboxConfig = { commands: [['true']], timeoutMs: 5_000 };

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

export const API_TEXT = 'export const broken = true;\n';
export const API_FIXED_TEXT = 'export const ok = true;\n';

/** The base tree every fix reads: pinned SHAs, real text. */
export function baseSnapshot(baseSha = 'base-sha'): BaseSnapshot {
  return {
    baseSha,
    treeSha: 'base-tree',
    files: [
      {
        path: 'README.md',
        blobSha: 'blob-readme',
        bytes: bytesOf('# haunted candy shop\n'),
        text: '# haunted candy shop\n',
      },
      { path: 'src/api.ts', blobSha: 'blob-api', bytes: bytesOf(API_TEXT), text: API_TEXT },
    ],
  };
}

/** A model reply for the fake gateway: one unified diff pinned to the base. */
export const goodProposal: PatchProposal = {
  baseSha: 'base-sha',
  files: [
    {
      path: 'src/api.ts',
      baseBlobSha: 'blob-api',
      diff: '@@ -1 +1 @@\n-export const broken = true;\n+export const ok = true;\n',
      linesChanged: 1,
    },
  ],
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
