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

export interface PrRef {
  repo: string;
  number: number;
  url: string;
  branch: string;
  headSha: string;
}
