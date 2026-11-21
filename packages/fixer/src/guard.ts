import { GraveshiftError } from '@graveshift/core';

import type { Patch, RepoPolicy } from './types';

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

// SEC-6: runs before any push. Forbidden paths match case-insensitively so `.ENV` cannot slip through.
export function guardPatch(patch: Patch, repo: RepoPolicy): void {
  const reasons: string[] = [];
  if (patch.files.length === 0) reasons.push('empty patch');
  if (patch.files.length > repo.maxFilesChanged) {
    reasons.push(`${patch.files.length} files exceeds maxFilesChanged ${repo.maxFilesChanged}`);
  }
  const lines = patch.files.reduce((sum, f) => sum + f.linesChanged, 0);
  if (lines > repo.maxLinesChanged)
    reasons.push(`${lines} lines exceeds maxLinesChanged ${repo.maxLinesChanged}`);

  const seen = new Set<string>();
  for (const file of patch.files) {
    if (!Number.isInteger(file.linesChanged) || file.linesChanged < 0)
      reasons.push(`${file.path}: invalid line count`);
    if (unsafePath(file.path)) {
      reasons.push(`${file.path}: unsafe path`);
      continue;
    }
    if (seen.has(file.path)) reasons.push(`${file.path}: duplicate path`);
    seen.add(file.path);
    if (matches(repo.forbiddenPaths, file.path, false))
      reasons.push(`${file.path}: forbidden path`);
    else if (!matches(repo.allowedPaths, file.path, true))
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
