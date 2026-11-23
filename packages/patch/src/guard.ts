import { GraveshiftError } from '@graveshift/core';

import { lineDiff } from './diff';
import type { Patch, RepoRules } from './schemas';

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
export function guardPatch(patch: Patch, rules: RepoRules): void {
  const reasons: string[] = [];
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

// One line-count implementation lives in './diff'. It is exact for files inside
// the LCS limit and an upper bound above it, so a model can never under-report.
export function diffStats(before: string | null, after: string | null): number {
  const changed = lineDiff(before ?? '', after ?? '');
  return changed.additions + changed.deletions;
}
