import { type Diagnosis, GraveshiftError, type Incident } from '@graveshift/core';

import { assertBranchPrefix, branchRef } from './branch';
import type { GitHubClient } from './client';
import { guardPatch } from './guard';
import { renderPrBody } from './pr-body';
import type { CheckOutcome } from './sandbox';
import type { Patch, PrRef, PullDiffSummary, RepoPolicy } from './types';

export const PR_LABELS = ['graveshift', 'exorcism'];

export class RepoNotAllowedError extends GraveshiftError<'REPO_NOT_ALLOWED'> {
  constructor(message: string) {
    super('REPO_NOT_ALLOWED', message);
  }
}

export class StaleBaseError extends GraveshiftError<'STALE_BASE'> {
  constructor(message: string) {
    super('STALE_BASE', message);
  }
}

/** The base the patch was read and verified against. Publishing re-checks it. */
export interface PinnedBase {
  readonly sha: string;
  readonly treeSha: string;
}

export interface OpenDraftPrInput {
  client: GitHubClient;
  repo: RepoPolicy;
  patch: Patch;
  base: PinnedBase;
  /** Sandbox check results. Publishing only happens after they passed. */
  checks: readonly CheckOutcome[];
  diff: PullDiffSummary;
  incident: Incident;
  diagnosis: Diagnosis;
  category: string;
  dashboardUrl: string;
  // Short, redacted text for the branch slug, commit subject and PR title.
  // diagnosis.rootCause may carry untrusted wrappers and belongs only in the body.
  headline?: string;
  /** The clock that stamps PrRef.openedAt: injected so a test controls it. */
  now: () => Date;
}

// Order matters: every check runs before the first mutating client call, so a
// rejected or stale patch pushes nothing. The tree is built against the pinned
// base tree, never against a newer head.
export async function openDraftPr(input: OpenDraftPrInput): Promise<PrRef> {
  const { client, repo, patch, base, now } = input;
  if (!repo.services.includes(input.incident.service)) {
    throw new RepoNotAllowedError(
      `service ${input.incident.service} is not mapped to ${repo.repo}`,
    );
  }
  guardPatch(patch, repo);
  const headline = (input.headline ?? input.diagnosis.rootCause).replace(/\s+/g, ' ').trim();
  const branch = branchRef(input.incident.id, headline, repo.branchPrefix);
  assertBranchPrefix(branch, repo.branchPrefix);

  const liveSha = await client.getBaseSha(repo.repo, repo.baseBranch);
  if (liveSha !== base.sha) {
    throw new StaleBaseError(
      `base ${repo.baseBranch} moved from ${base.sha} to ${liveSha}; nothing was pushed`,
    );
  }
  const entries = await Promise.all(
    patch.files.map(async (f) => ({
      path: f.path,
      sha: f.content === null ? null : await client.createBlob(repo.repo, f.content),
    })),
  );
  const tree = await client.createTree(repo.repo, base.treeSha, entries);
  const headSha = await client.createCommit(
    repo.repo,
    `fix: ${headline.slice(0, 60)} (incident ${input.incident.id})`,
    tree,
    base.sha,
  );
  await client.createRef(repo.repo, branch, headSha);

  const title = `Exorcism: ${headline.slice(0, 70)}`;
  const body = renderPrBody({
    ...input,
    files: patch.files.map((f) => f.path),
  });
  const pr = await client.createPullRequest(repo.repo, {
    title,
    body,
    head: branch.replace(/^refs\/heads\//, ''),
    base: repo.baseBranch,
    draft: true,
  });
  await client.addLabels(repo.repo, pr.number, PR_LABELS);
  return {
    repo: repo.repo,
    number: pr.number,
    url: pr.url,
    branch,
    headSha,
    openedAt: now().toISOString(),
  };
}
