import type { RepoRules } from '@graveshift/patch/schemas';

export interface RepoPolicy extends RepoRules {
  repo: string;
  services: string[];
  baseBranch: string;
  branchPrefix: string;
  draft: true;
}

export interface PrRef {
  repo: string;
  number: number;
  url: string;
  branch: string;
  headSha: string;
}
