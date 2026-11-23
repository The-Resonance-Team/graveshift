import type { GitHubClient } from './client';
import { FixerFault, PublicationError } from './faults';
import { publicationText, writeDraft, type OpenDraftPrInput } from './open-pr';
import type { SourceSnapshot } from './source';
import type { PrRef } from './types';
import { assertVerified, type VerifiedPatch } from './verify';

export interface PublicationPlan {
  readonly repo: string;
  readonly branch: string;
  readonly baseSha: string;
}

export interface VerifiedPublicationInput extends Omit<OpenDraftPrInput, 'patch'> {
  snapshot: SourceSnapshot;
  verified: VerifiedPatch;
}

export function planPublication(input: VerifiedPublicationInput): PublicationPlan {
  assertVerified(input.snapshot, input.verified);
  const { snapshot, repo } = input;
  if (snapshot.repo !== repo.repo || snapshot.baseBranch !== repo.baseBranch) {
    throw new FixerFault('STALE_BASE', 'publication repository differs from verified source');
  }
  const text = publicationText({ ...input, patch: input.verified.patch }, input.verified);
  return { repo: repo.repo, branch: text.branch, baseSha: snapshot.baseSha };
}

export async function recoverPublication(
  client: GitHubClient,
  plan: PublicationPlan,
): Promise<PrRef | undefined> {
  try {
    const reference = await client.getExistingDraft(plan.repo, plan.branch, plan.baseSha);
    if (reference && (reference.repo !== plan.repo || reference.branch !== plan.branch)) {
      throw new PublicationError('recovery', true);
    }
    return reference;
  } catch {
    throw new PublicationError('recovery', true);
  }
}

export async function publishVerified(
  input: VerifiedPublicationInput & { plan: PublicationPlan },
): Promise<PrRef> {
  const expected = planPublication(input);
  if (
    expected.repo !== input.plan.repo ||
    expected.branch !== input.plan.branch ||
    expected.baseSha !== input.plan.baseSha
  ) {
    throw new FixerFault('STALE_BASE', 'publication intent differs from the verified plan');
  }
  const snapshot = structuredClone(input.snapshot);
  const publication = {
    ...input,
    repo: structuredClone(input.repo),
    patch: structuredClone(input.verified.patch),
  };
  const text = publicationText(publication, input.verified);
  const existing = await recoverPublication(input.client, expected);
  if (existing) return existing;
  return writeDraft(
    publication,
    text,
    snapshot.baseSha,
    snapshot.treeSha,
    new Map(snapshot.files.map((file) => [file.path, file.mode])),
  );
}
