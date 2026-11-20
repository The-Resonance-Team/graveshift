import type { GitHubClient, RepoPolicy } from '@graveshift/fixer';
import type { PatchGateway } from '@graveshift/patch';
import type { Policy } from '@graveshift/policy';

export const FIX_DEPS = Symbol('FIX_DEPS');

// All outside collaborators are injected. Tests supply fakes; no real model or GitHub call is wired.
export interface FixDeps {
  readonly policy: Policy;
  readonly repo: RepoPolicy;
  readonly gateway: PatchGateway;
  readonly client: GitHubClient;
  readonly agent: string;
  readonly envMode?: string;
}
