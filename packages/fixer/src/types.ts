import type { PrRef } from '@graveshift/core';
import type { Policy } from '@graveshift/policy';

export type RepoPolicy = Policy['github']['repos'][number];

export interface PatchFile {
  path: string;
  content: string | null;
  linesChanged: number;
}

export interface Patch {
  files: PatchFile[];
}

// The canonical PrRef lives in @graveshift/core with its schema.
export type { PrRef };

/** Real diff size of a verified patch, shown in the pull request body. */
export interface PullDiffSummary {
  readonly filesChanged: number;
  readonly additions: number;
  readonly deletions: number;
}
