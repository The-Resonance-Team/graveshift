import { type Patch, guardPatch, PatchSchema, type RepoRules } from '@graveshift/patch';
import { loadPolicy } from '@graveshift/policy';
import { redact } from '@graveshift/redactor';

export const BRANCH_SLUG_PATTERN = /^graveshift\/[A-Za-z0-9._/-]+$/;

export const MAX_PATCH_PAYLOAD_BYTES = 1024 * 1024;

export function assertBranchSlug(slug: string | undefined): string {
  if (slug === undefined || !BRANCH_SLUG_PATTERN.test(slug)) {
    throw new Error(`branch_slug must match ${BRANCH_SLUG_PATTERN.source}`);
  }
  if (slug.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('branch_slug has an invalid path segment');
  }
  return slug;
}

export function assertPayloadSize(raw: string | undefined): string {
  if (raw === undefined || raw.length === 0) throw new Error('patch_payload is empty');
  if (Buffer.byteLength(raw, 'utf8') > MAX_PATCH_PAYLOAD_BYTES) {
    throw new Error('patch_payload exceeds the size limit');
  }
  return raw;
}

// A caller-supplied decision is data, never a permission grant by itself.
export function assertPolicyAllow(raw: string | undefined): void {
  if (raw === undefined) throw new Error('policy_decision is missing');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('policy_decision is not JSON');
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error('policy_decision is not an object');
  }
  const { effect, action } = value as Record<string, unknown>;
  if (effect !== 'allow') throw new Error('no recorded policy allow');
  if (action !== undefined && action !== 'open_pr') {
    throw new Error('policy_decision is not for open_pr');
  }
}

export async function repoRules(): Promise<RepoRules> {
  const policy = await loadPolicy(process.env.POLICY_PATH ?? 'policy.example.yaml');
  const repos = policy.github.repos;
  const repo = repos.find((entry) => entry.repo === process.env.GITHUB_REPOSITORY) ?? repos[0];
  if (repo === undefined) throw new Error('no repo rules in policy');
  return {
    allowedPaths: repo.allowedPaths,
    forbiddenPaths: repo.forbiddenPaths,
    maxFilesChanged: repo.maxFilesChanged,
    maxLinesChanged: repo.maxLinesChanged,
  };
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
    const reason = error instanceof Error ? redact(error.message) : 'unknown reason';
    throw new Error(`patch rejected: ${reason}`, { cause: error });
  }
  return parsed.data;
}

// Redaction can change file content, so parse and guard the result again.
export function redactPatch(patch: Patch): Patch {
  const files = patch.files.map((file) => ({
    ...file,
    content: file.content === null ? null : redact(file.content),
  }));
  const parsed = PatchSchema.safeParse({ files });
  if (!parsed.success) throw new Error('redacted patch failed schema validation');
  return parsed.data;
}

export function fail(error: unknown): never {
  const message = error instanceof Error ? redact(error.message) : 'unknown failure';
  console.error(`one-shot job failed: ${message}`);
  process.exit(1);
}
