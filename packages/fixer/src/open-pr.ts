import { type Diagnosis, GraveshiftError, type Incident } from '@graveshift/core';
import { guardPatch } from '@graveshift/patch/guard';
import type { Patch } from '@graveshift/patch/schemas';

import { branchRef } from './branch';
import type { GitHubClient } from './client';
import { FixerFault, PublicationError, type PublicationPhase } from './faults';
import { outboundLine } from './outbound';
import { renderPrBody } from './pr-body';
import type { PrRef, RepoPolicy } from './types';
import type { VerifiedPatch } from './verify';

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
  // Optional text for the branch slug, commit subject and PR title. Publication redacts it.
  // diagnosis.rootCause may carry untrusted wrappers and belongs only in the body.
  headline?: string;
}

export function publicationText(input: OpenDraftPrInput, verification?: VerifiedPatch) {
  const { repo, patch, incident, diagnosis } = input;
  if (!repo.services.includes(incident.service)) {
    throw new RepoNotAllowedError(`service ${incident.service} is not mapped to ${repo.repo}`);
  }
  guardPatch(patch, repo);
  const headline = outboundLine(input.headline ?? diagnosis.rootCause) || 'Fix incident';
  const identity =
    verification === undefined
      ? incident.id
      : JSON.stringify([incident.id, verification.snapshotHash, verification.patchHash]);
  const branch = branchRef(identity, headline, repo.branchPrefix);
  const subject = `fix: ${headline.slice(0, 60)} (incident ${outboundLine(incident.id)})`;
  const title = `Exorcism: ${headline.slice(0, 70)}`;
  const body = renderPrBody({
    ...input,
    files: patch.files.map((f) => f.path),
    ...(verification === undefined ? {} : { verification }),
  });
  return { branch, subject, title, body };
}

async function effect<T>(
  phase: PublicationPhase,
  uncertain: boolean,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch {
    throw new PublicationError(phase, uncertain);
  }
}

export async function writeDraft(
  input: OpenDraftPrInput,
  text: ReturnType<typeof publicationText>,
  baseSha: string,
  baseTree: string,
  modes: ReadonlyMap<string, '100644' | '100755'> = new Map(),
): Promise<PrRef> {
  const { client, repo, patch } = input;
  const { branch, subject, title, body } = text;
  if (patch.baseSha !== baseSha) {
    throw new FixerFault('STALE_BASE', 'patch base no longer matches the publication base');
  }
  const entries = await effect('blob', false, () =>
    Promise.all(
      patch.files.map(async (f) => ({
        path: f.path,
        sha: f.content === null ? null : await client.createBlob(repo.repo, f.content),
        mode: modes.get(f.path) ?? '100644',
      })),
    ),
  );
  const tree = await effect('tree', false, () => client.createTree(repo.repo, baseTree, entries));
  const headSha = await effect('commit', false, () =>
    client.createCommit(repo.repo, subject, tree, baseSha),
  );
  await effect('branch', true, () => client.createRef(repo.repo, branch, headSha));

  const pr = await effect('draft', true, () =>
    client.createPullRequest(repo.repo, {
      title,
      body,
      head: branch.replace(/^refs\/heads\//, ''),
      base: repo.baseBranch,
      draft: true,
    }),
  );
  const createdPrRef = { repo: repo.repo, number: pr.number, url: pr.url, branch, headSha };
  try {
    await client.addLabels(repo.repo, pr.number, PR_LABELS);
  } catch {
    // Labels are optional. The draft exists and its reference must survive this failure.
  }
  return createdPrRef;
}

// Direct callers still cross the canonical guard before the first client call.
export async function openDraftPr(input: OpenDraftPrInput): Promise<PrRef> {
  const text = publicationText(input);
  const { client, repo } = input;
  const baseSha = await client.getBaseSha(repo.repo, repo.baseBranch);
  const baseTree = await client.getCommitTree(repo.repo, baseSha);
  return writeDraft(input, text, baseSha, baseTree);
}
