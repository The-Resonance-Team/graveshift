import { type Diagnosis, GraveshiftError, type Incident } from '@graveshift/core';

import { assertBranchPrefix, branchRef } from './branch';
import type { GitHubClient } from './client';
import { guardPatch } from './guard';
import { renderPrBody } from './pr-body';
import type { Patch, PrRef, RepoPolicy } from './types';

export const PR_LABELS = ['graveshift', 'exorcism'];

export class RepoNotAllowedError extends GraveshiftError<'REPO_NOT_ALLOWED'> {
  constructor(message: string) {
    super('REPO_NOT_ALLOWED', message);
  }
}

export interface OpenDraftPrInput {
  client: GitHubClient;
  repo: RepoPolicy;
  patch: Patch;
  incident: Incident;
  diagnosis: Diagnosis;
  category: string;
  dashboardUrl: string;
  // Short, redacted text for the branch slug, commit subject and PR title.
  // diagnosis.rootCause may carry untrusted wrappers and belongs only in the body.
  headline?: string;
}

// Order matters: every check runs before the first client call, so a rejected patch pushes nothing.
export async function openDraftPr(input: OpenDraftPrInput): Promise<PrRef> {
  const { client, repo, patch, incident, diagnosis } = input;
  if (!repo.services.includes(incident.service)) {
    throw new RepoNotAllowedError(`service ${incident.service} is not mapped to ${repo.repo}`);
  }
  guardPatch(patch, repo);
  const headline = (input.headline ?? diagnosis.rootCause).replace(/\s+/g, ' ').trim();
  const branch = branchRef(incident.id, headline, repo.branchPrefix);
  assertBranchPrefix(branch, repo.branchPrefix);

  const baseSha = await client.getBaseSha(repo.repo, repo.baseBranch);
  const baseTree = await client.getCommitTree(repo.repo, baseSha);
  const entries = await Promise.all(
    patch.files.map(async (f) => ({
      path: f.path,
      sha: f.content === null ? null : await client.createBlob(repo.repo, f.content),
    })),
  );
  const tree = await client.createTree(repo.repo, baseTree, entries);
  const headSha = await client.createCommit(
    repo.repo,
    `fix: ${headline.slice(0, 60)} (incident ${incident.id})`,
    tree,
    baseSha,
  );
  await client.createRef(repo.repo, branch, headSha);

  const title = `Exorcism: ${headline.slice(0, 70)}`;
  const body = renderPrBody({ ...input, files: patch.files.map((f) => f.path) });
  const pr = await client.createPullRequest(repo.repo, {
    title,
    body,
    head: branch.replace(/^refs\/heads\//, ''),
    base: repo.baseBranch,
    draft: true,
  });
  await client.addLabels(repo.repo, pr.number, PR_LABELS);
  return { repo: repo.repo, number: pr.number, url: pr.url, branch, headSha };
}
