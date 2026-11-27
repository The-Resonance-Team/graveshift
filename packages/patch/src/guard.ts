import { GraveshiftError } from '@graveshift/core';

import { SHA40_PATTERN, type Patch, type RepoRules } from './schemas';

export class PatchRejectedError extends GraveshiftError<'PATCH_REJECTED'> {
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super('PATCH_REJECTED', `patch rejected: ${reasons.join('; ')}`);
    this.reasons = reasons;
  }
}

const matches = (patterns: readonly string[], path: string, caseSensitive: boolean): boolean =>
  patterns.some((pattern) =>
    caseSensitive
      ? new Bun.Glob(pattern).match(path)
      : new Bun.Glob(pattern.toLowerCase()).match(path.toLowerCase()),
  );

export function unsafePath(path: string): boolean {
  return (
    path === '' ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  );
}

const contentLines = (content: string | null): number =>
  content === null ? 0 : diffStats(null, content);

// SEC-6: guardPatch runs before any caller-visible success. Forbidden paths match
// case-insensitively so .ENV cannot slip through. allowedPaths stay case-sensitive.
// The real line count of content is an upper bound on changed lines, so the
// model cannot lower the counted size by under-reporting linesChanged.
// Base identity is checked here as well so direct publication and one-shot
// intake reject a patch that carries no usable base before any other effect.
export function guardPatch(patch: Patch, rules: RepoRules): void {
  const reasons: string[] = [];
  if (!SHA40_PATTERN.test(patch.baseSha)) reasons.push('baseSha must be a 40-hex git SHA');
  if (patch.files.length === 0) reasons.push('empty patch');
  if (patch.files.length > rules.maxFilesChanged) {
    reasons.push(`${patch.files.length} files exceeds maxFilesChanged ${rules.maxFilesChanged}`);
  }
  // The self-reported count can only raise the total, never lower it.
  const lines = patch.files.reduce(
    (sum, file) => sum + Math.max(file.linesChanged, contentLines(file.content)),
    0,
  );
  if (lines > rules.maxLinesChanged)
    reasons.push(`${lines} lines exceeds maxLinesChanged ${rules.maxLinesChanged}`);

  // macOS uses a case-insensitive file system; a path collision is a duplicate there.
  const seen = new Set<string>();
  for (const file of patch.files) {
    if (!Number.isInteger(file.linesChanged) || file.linesChanged < 0)
      reasons.push(`${file.path}: invalid line count`);
    if (file.content === null && file.baseBlobSha !== null)
      reasons.push(`${file.path}: baseBlobSha must be null for a deletion`);
    if (file.content !== null && !SHA40_PATTERN.test(file.baseBlobSha ?? ''))
      reasons.push(`${file.path}: baseBlobSha must be a 40-hex git SHA`);
    if (file.content !== null && contentLines(file.content) > rules.maxLinesChanged) {
      reasons.push(`${file.path}: content exceeds maxLinesChanged ${rules.maxLinesChanged}`);
    }
    if (unsafePath(file.path)) {
      reasons.push(`${file.path}: unsafe path`);
      continue;
    }
    const key = file.path.toLowerCase();
    if (seen.has(key)) reasons.push(`${file.path}: duplicate path`);
    seen.add(key);
    if (matches(rules.forbiddenPaths, file.path, false))
      reasons.push(`${file.path}: forbidden path`);
    else if (!matches(rules.allowedPaths, file.path, true))
      reasons.push(`${file.path}: outside allowedPaths`);
  }
  if (reasons.length > 0) throw new PatchRejectedError(reasons);
}

// ponytail: counts the span between common prefix and suffix, an upper bound on the real diff, upgrade if the cap blocks small fixes
export function diffStats(before: string | null, after: string | null): number {
  const a = before === null ? [] : before.split('\n');
  const b = after === null ? [] : after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return endA - start + (endB - start);
}
