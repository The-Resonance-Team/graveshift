import { type WorkItem } from '@graveshift/core';
import type { GitHubClient, RepoPolicy } from '@graveshift/fixer';
import type { PatchGateway } from '@graveshift/patch';
import type { Policy, PolicyContext } from '@graveshift/policy';
import { z } from 'zod';

export const FIX_DEPS = Symbol('FIX_DEPS');

// Every value in the policy context is read from an injected provider. A missing
// or malformed value blocks the fix; no default can raise confidence or clear a counter.
export const FixContextSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    category: z.string().min(1),
    signals: z.array(z.string().min(1)).min(1),
    counters: z
      .object({
        openPrsLastHour: z.number().int().min(0),
        actionsLast10Min: z.number().int().min(0),
        diagnosisLoops: z.number().int().min(0),
        llmSpentTodayUsd: z.number().min(0),
      })
      .strict(),
  })
  .strict();
export type FixContext = z.infer<typeof FixContextSchema>;

export type FixContextLoad = { ok: true; value: FixContext } | { ok: false; reason: string };

export interface FixContextProvider {
  load(item: WorkItem): Promise<FixContextLoad>;
}

export type FixFailureCode =
  | 'none'
  | 'auto_fix_disabled'
  | 'context_unavailable'
  | 'invalid_context'
  | 'policy_denied'
  | 'patch_rejected'
  | 'pr_failed';

// All outside collaborators are injected. Tests supply fakes; no real model or GitHub call is wired.
export interface FixDeps {
  readonly policy: Policy;
  readonly repo: RepoPolicy;
  readonly gateway: PatchGateway;
  readonly client: GitHubClient;
  readonly context: FixContextProvider;
  readonly agent: string;
  readonly envMode?: PolicyContext['envMode'];
}
