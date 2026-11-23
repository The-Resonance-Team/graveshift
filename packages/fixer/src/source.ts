import { createHash } from 'node:crypto';

import { unsafePath } from '@graveshift/patch/guard';
import {
  EMPTY_BLOB_SHA,
  type Patch,
  RepoRulesSchema,
  type RepoRules,
} from '@graveshift/patch/schemas';

import type { GitHubClient, SourceEntry } from './client';
import { FixerFault } from './faults';
import type { RepoPolicy } from './types';

export interface SourceFile {
  readonly path: string;
  readonly blobSha: string;
  readonly content: string;
  readonly mode: '100644' | '100755';
}

export interface SourceSnapshot {
  readonly repo: string;
  readonly baseBranch: string;
  readonly baseSha: string;
  readonly treeSha: string;
  readonly files: readonly SourceFile[];
  readonly entries: readonly SourceEntry[];
  readonly rules: RepoRules;
}

export interface SourceLimits {
  maxFiles: number;
  maxBytes: number;
}

export const SOURCE_LIMITS: Readonly<SourceLimits> = { maxFiles: 200, maxBytes: 1024 * 1024 };

export function safeSourcePath(path: string): boolean {
  return (
    !unsafePath(path) &&
    !/[\p{Cc}]/u.test(path) &&
    !path.split('/').some((part) => part.toLowerCase() === '.git')
  );
}

function selected(path: string, rules: RepoRules): boolean {
  return (
    rules.allowedPaths.some((pattern) => new Bun.Glob(pattern).match(path)) &&
    !rules.forbiddenPaths.some((pattern) =>
      new Bun.Glob(pattern.toLowerCase()).match(path.toLowerCase()),
    )
  );
}

export function sourceEntries(entries: readonly SourceEntry[], rules: RepoRules): SourceEntry[] {
  const files = entries.filter((entry) => selected(entry.path, rules));
  const seen = new Set<string>();
  for (const file of files) {
    const path = file.path.toLowerCase();
    if (!safeSourcePath(file.path) || !['100644', '100755'].includes(file.mode) || seen.has(path)) {
      throw new FixerFault('SOURCE_UNAVAILABLE', 'source paths are unsafe or ambiguous');
    }
    seen.add(path);
  }
  for (const file of files) {
    const parts = file.path.toLowerCase().split('/');
    parts.pop();
    while (parts.length > 0) {
      if (seen.has(parts.join('/'))) {
        throw new FixerFault('SOURCE_UNAVAILABLE', 'source has a file and directory collision');
      }
      parts.pop();
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function blobHash(content: string): string {
  return createHash('sha1')
    .update(`blob ${Buffer.byteLength(content)}\0`)
    .update(content)
    .digest('hex');
}

export function sourceHash(snapshot: SourceSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

export function validateSnapshot(snapshot: SourceSnapshot): void {
  RepoRulesSchema.parse(snapshot.rules);
  const entries = sourceEntries(snapshot.entries, snapshot.rules);
  if (
    snapshot.entries.length > 20_000 ||
    entries.length !== snapshot.files.length ||
    snapshot.files.length > SOURCE_LIMITS.maxFiles ||
    snapshot.files.reduce((bytes, file) => bytes + Buffer.byteLength(file.content), 0) >
      SOURCE_LIMITS.maxBytes ||
    snapshot.files.some(
      (file) =>
        blobHash(file.content) !== file.blobSha ||
        file.content.includes('\0') ||
        !entries.some(
          (entry) =>
            entry.path === file.path && entry.blobSha === file.blobSha && entry.mode === file.mode,
        ),
    )
  ) {
    throw new FixerFault('SOURCE_UNAVAILABLE', 'source snapshot is invalid');
  }
}

// The patch must carry the identity of the tree it was generated against.
// A stale base blocks before a workspace, check or GitHub write starts.
export function assertPatchBase(snapshot: SourceSnapshot, patch: Patch): void {
  if (patch.baseSha !== snapshot.baseSha) {
    throw new FixerFault('STALE_BASE', 'patch base no longer matches the source snapshot');
  }
  for (const file of patch.files) {
    const base = snapshot.files.find((entry) => entry.path === file.path);
    if (file.content === null) {
      if (file.baseBlobSha !== null || base === undefined) {
        throw new FixerFault(
          'STALE_BASE',
          `${file.path}: patch deletion has no matching base blob`,
        );
      }
    } else if (base === undefined) {
      if (file.baseBlobSha !== EMPTY_BLOB_SHA) {
        throw new FixerFault(
          'STALE_BASE',
          `${file.path}: patch addition has no matching base blob`,
        );
      }
    } else if (file.baseBlobSha !== base.blobSha) {
      throw new FixerFault('STALE_BASE', `${file.path}: patch base blob no longer matches`);
    }
  }
}

export function validatePatchTargets(snapshot: SourceSnapshot, patch: Patch): void {
  for (const file of patch.files) {
    if (!safeSourcePath(file.path)) throw new FixerFault('CHECK_FAILED', 'unsafe patch target');
    const after = file.path.toLowerCase();
    const candidates = [...snapshot.entries, ...patch.files.filter((other) => other !== file)];
    if (
      candidates.some((entry) => {
        const before = entry.path.toLowerCase();
        return (
          (before === after && entry.path !== file.path) ||
          before.startsWith(`${after}/`) ||
          after.startsWith(`${before}/`)
        );
      })
    )
      throw new FixerFault('CHECK_FAILED', 'patch collides with repository paths');
    if (file.content === null && !snapshot.files.some((entry) => entry.path === file.path)) {
      throw new FixerFault('CHECK_FAILED', 'patch deletes a file absent from the source');
    }
  }
}

export async function prepareSource(
  repo: RepoPolicy,
  client: GitHubClient,
  baseSha: string,
  limits: SourceLimits = SOURCE_LIMITS,
): Promise<SourceSnapshot> {
  try {
    if (!/^[0-9a-f]{40}$/.test(baseSha)) {
      throw new FixerFault('STALE_BASE', 'the Deployment does not carry a commit SHA');
    }
    if (
      !Number.isInteger(limits.maxFiles) ||
      limits.maxFiles < 1 ||
      limits.maxFiles > SOURCE_LIMITS.maxFiles ||
      !Number.isInteger(limits.maxBytes) ||
      limits.maxBytes < 1 ||
      limits.maxBytes > SOURCE_LIMITS.maxBytes
    ) {
      throw new FixerFault('SOURCE_UNAVAILABLE', 'invalid source limits');
    }
    const rules = RepoRulesSchema.parse({
      allowedPaths: [...repo.allowedPaths],
      forbiddenPaths: [...repo.forbiddenPaths],
      maxFilesChanged: repo.maxFilesChanged,
      maxLinesChanged: repo.maxLinesChanged,
    });
    // The patch base is the deployed SHA, not the current branch HEAD.
    const treeSha = await client.getCommitTree(repo.repo, baseSha);
    const treeEntries = await client.getTree(repo.repo, treeSha);
    if (treeEntries.length > 20_000)
      throw new FixerFault('SOURCE_UNAVAILABLE', 'source tree exceeds limit');
    const entries = sourceEntries(treeEntries, rules);
    if (entries.length === 0 || entries.length > limits.maxFiles) {
      throw new FixerFault('SOURCE_UNAVAILABLE', 'source file count exceeds limits or is empty');
    }
    let bytes = 0;
    const files = await entries.reduce<Promise<SourceFile[]>>(async (previous, entry) => {
      const accumulated = await previous;
      if (entry.size !== undefined && bytes + entry.size > limits.maxBytes) {
        throw new FixerFault('SOURCE_UNAVAILABLE', 'source byte count exceeds limit');
      }
      const content = await client.readBlob(repo.repo, entry.blobSha);
      bytes += Buffer.byteLength(content);
      if (
        bytes > limits.maxBytes ||
        blobHash(content) !== entry.blobSha ||
        content.includes('\0') ||
        (entry.mode !== '100644' && entry.mode !== '100755')
      ) {
        throw new FixerFault('SOURCE_UNAVAILABLE', 'source content is invalid or exceeds limit');
      }
      accumulated.push({ path: entry.path, blobSha: entry.blobSha, mode: entry.mode, content });
      return accumulated;
    }, Promise.resolve([]));
    return {
      repo: repo.repo,
      baseBranch: repo.baseBranch,
      baseSha,
      treeSha,
      files,
      entries: treeEntries,
      rules,
    };
  } catch (error) {
    if (error instanceof FixerFault) throw error;
    throw new FixerFault('SOURCE_UNAVAILABLE', 'repository source could not be read');
  }
}
