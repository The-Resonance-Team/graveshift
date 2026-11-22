import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, sep } from 'node:path';

import { loadGraveshiftConfig } from '@graveshift/config';
import {
  EMPTY_BLOB_SHA,
  type Patch,
  guardPatch,
  PatchSchema,
  type RepoRules,
} from '@graveshift/patch';
import { type Policy, type PolicyContext, type PolicyDecision, decide } from '@graveshift/policy';
import { redact } from '@graveshift/redactor';

import { type DecisionBinding, verifyPolicySignature } from './policy-signature';

export const BRANCH_SLUG_PATTERN = /^graveshift\/[A-Za-z0-9._/-]+$/;
const SAFE_REF = /^[A-Za-z0-9._/-]+$/;
export const MAX_PATCH_PAYLOAD_BYTES = 1024 * 1024;

export class OneShotPolicyError extends Error {
  readonly code: 'REPO_RULES_UNKNOWN' | 'POLICY_DENIED' | 'POLICY_DECISION_INVALID';
  constructor(code: OneShotPolicyError['code'], message: string) {
    super(message);
    this.name = 'OneShotPolicyError';
    this.code = code;
  }
}

export function assertBranchSlug(slug: string | undefined): string {
  if (slug === undefined || !BRANCH_SLUG_PATTERN.test(slug)) {
    throw new Error(`branch_slug must match ${BRANCH_SLUG_PATTERN.source}`);
  }
  if (slug.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('branch_slug has an invalid path segment');
  }
  return slug;
}

export function assertBaseRef(baseRef: string | undefined): string {
  if (baseRef === undefined || !SAFE_REF.test(baseRef))
    throw new Error('base_ref is not a safe git ref');
  if (baseRef.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('base_ref has an invalid path segment');
  }
  return baseRef;
}

export function assertPayloadSize(raw: string | undefined): string {
  if (raw === undefined || raw.length === 0) throw new Error('patch_payload is empty');
  if (Buffer.byteLength(raw, 'utf8') > MAX_PATCH_PAYLOAD_BYTES)
    throw new Error('patch_payload exceeds the size limit');
  return raw;
}

const asObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('expected an object');
  return value as Record<string, unknown>;
};
const asString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value === '') throw new Error(`${field} must be a string`);
  return value;
};
const asNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error(`${field} must be a non-negative number`);
  return value;
};

export interface RecordedDecision {
  context: unknown;
  matchedRule?: string | null;
  reason?: string;
}

export function assertPolicyAllow(raw: string | undefined): RecordedDecision {
  if (raw === undefined) throw new Error('policy_decision is missing');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('policy_decision is not JSON');
  }
  const decision = asObject(value);
  if (decision.effect !== 'allow') throw new Error('no recorded policy allow');
  if (decision.action !== undefined && decision.action !== 'open_pr')
    throw new Error('policy_decision is not for open_pr');
  if (decision.context === undefined) throw new Error('policy_decision has no context');
  const recorded: RecordedDecision = { context: decision.context };
  if (typeof decision.matchedRule === 'string' || decision.matchedRule === null)
    recorded.matchedRule = decision.matchedRule;
  if (typeof decision.reason === 'string') recorded.reason = decision.reason;
  return recorded;
}

export function parsePolicyContext(raw: unknown): PolicyContext {
  const context = asObject(raw);
  const signals = context.signals;
  if (!Array.isArray(signals) || !signals.every((signal) => typeof signal === 'string'))
    throw new Error('context.signals must be an array of strings');
  const counters = asObject(context.counters);
  const base: PolicyContext = {
    service: asString(context.service, 'context.service'),
    signals,
    confidence: asNumber(context.confidence, 'context.confidence'),
    counters: {
      openPrsLastHour: asNumber(counters.openPrsLastHour, 'openPrsLastHour'),
      actionsLast10Min: asNumber(counters.actionsLast10Min, 'actionsLast10Min'),
      diagnosisLoops: asNumber(counters.diagnosisLoops, 'diagnosisLoops'),
      llmSpentTodayUsd: asNumber(counters.llmSpentTodayUsd, 'llmSpentTodayUsd'),
    },
  };
  if (context.category !== undefined)
    base.category = asString(context.category, 'context.category');
  if (context.envMode !== undefined) base.envMode = asString(context.envMode, 'context.envMode');
  return base;
}

export function evaluatePolicyAllow(raw: string | undefined, policy: Policy): PolicyDecision {
  const recorded = assertPolicyAllow(raw);
  const decision = decide(policy, parsePolicyContext(recorded.context), { name: 'open_pr' });
  if (decision.effect !== 'allow')
    throw new OneShotPolicyError(
      'POLICY_DENIED',
      `policy re-evaluation did not allow open_pr: ${decision.reason}`,
    );
  if (recorded.matchedRule !== undefined && recorded.matchedRule !== decision.matchedRule)
    throw new OneShotPolicyError('POLICY_DECISION_INVALID', 'recorded matchedRule does not match');
  if (recorded.reason !== undefined && recorded.reason !== decision.reason)
    throw new OneShotPolicyError('POLICY_DECISION_INVALID', 'recorded reason does not match');
  return decision;
}

export function evaluateSignedPolicyAllow(
  raw: string | undefined,
  signature: string | undefined,
  secret: string | undefined,
  binding: DecisionBinding,
  policy: Policy,
): PolicyDecision {
  verifyPolicySignature(raw, signature, secret, binding);
  return evaluatePolicyAllow(raw, policy);
}

export interface OneShotPolicy {
  policy: Policy;
  rules: RepoRules;
}

export async function loadOneShotPolicy(): Promise<OneShotPolicy> {
  const policy = (await loadGraveshiftConfig()).policy;
  const repo = policy.github.repos.find((entry) => entry.repo === process.env.GITHUB_REPOSITORY);
  if (repo === undefined)
    throw new OneShotPolicyError(
      'REPO_RULES_UNKNOWN',
      `no policy rules for repository ${process.env.GITHUB_REPOSITORY ?? '<unset>'}`,
    );
  return {
    policy,
    rules: {
      allowedPaths: repo.allowedPaths,
      forbiddenPaths: repo.forbiddenPaths,
      maxFilesChanged: repo.maxFilesChanged,
      maxLinesChanged: repo.maxLinesChanged,
    },
  };
}

export async function repoRules(): Promise<RepoRules> {
  return (await loadOneShotPolicy()).rules;
}

export function validatePatch(raw: string, rules: RepoRules): Patch {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('patch is not JSON');
  }
  const parsed = PatchSchema.safeParse(value);
  if (!parsed.success) throw new Error('patch failed schema validation');
  try {
    guardPatch(parsed.data, rules);
  } catch (error) {
    throw new Error(
      `patch rejected: ${error instanceof Error ? redact(error.message) : 'unknown reason'}`,
      { cause: error },
    );
  }
  return parsed.data;
}

export function redactPatch(patch: Patch): Patch {
  // Redaction keeps the whole-tree base and every per-file base blob: dropping
  // them would make the signed artifact unverifiable and bypass the base guard.
  const files = patch.files.map((file) => ({
    ...file,
    content: file.content === null ? null : redact(file.content),
  }));
  const parsed = PatchSchema.safeParse({ baseSha: patch.baseSha, files });
  if (!parsed.success) throw new Error('redacted patch failed schema validation');
  return parsed.data;
}

export class OneShotBaseError extends Error {
  readonly code = 'PATCH_BASE_STALE';

  constructor() {
    super('patch base does not match the checked out commit');
    this.name = 'OneShotBaseError';
  }
}

// The patch is bound to one base commit. A changed base must stop the job before any write.
export function assertPatchBase(patch: Patch, baseSha: string): void {
  if (!/^[a-f0-9]{40}$/.test(baseSha) || patch.baseSha !== baseSha) throw new OneShotBaseError();
}

// The signed BASE_SHA is the commit the job writes on. The patch must name that same commit.
export function assertPatchMatchesBaseSha(patch: Patch, baseSha: string | undefined): string {
  if (!baseSha || !/^[0-9a-f]{40}$/.test(baseSha))
    throw new Error('base_sha must be a full commit SHA');
  if (patch.baseSha !== baseSha) throw new OneShotBaseError();
  return baseSha;
}

export class OneShotBlobError extends Error {
  readonly code = 'PATCH_BLOB_STALE';

  constructor(path: string) {
    super(`${path}: file changed since the patch was made`);
    this.name = 'OneShotBlobError';
  }
}

// Each edited file must still have the blob the patch was made from. A missing file
// counts as the empty blob, which is the base value for a new file.
export async function assertPatchBlobs(
  patch: Patch,
  blobAt: (path: string) => Promise<string | undefined>,
): Promise<void> {
  const edited = patch.files.filter((file) => file.content !== null);
  const actual = await Promise.all(edited.map((file) => blobAt(file.path)));
  edited.forEach((file, index) => {
    if ((actual[index] ?? EMPTY_BLOB_SHA) !== file.baseBlobSha)
      throw new OneShotBlobError(file.path);
  });
}

export function assertNoSymlinkEscape(rootReal: string, target: string): void {
  if (target !== rootReal && !target.startsWith(`${rootReal}${sep}`))
    throw new Error('patch path escapes the workspace');
  let cursor = target;
  while (cursor !== rootReal && cursor !== dirname(cursor)) {
    if (lstatSync(cursor, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error('patch path crosses a symlink');
    cursor = dirname(cursor);
  }
}

export function assertParentInside(rootReal: string, target: string): void {
  const parent = dirname(target);
  mkdirSync(parent, { recursive: true });
  const realParent = realpathSync(parent);
  if (realParent !== rootReal && !realParent.startsWith(`${rootReal}${sep}`))
    throw new Error('patch path escapes the workspace');
  if (lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new Error('patch path crosses a symlink');
}

export function fail(error: unknown): never {
  console.error(
    `one-shot job failed: ${error instanceof Error ? redact(error.message) : 'unknown failure'}`,
  );
  process.exit(1);
}
