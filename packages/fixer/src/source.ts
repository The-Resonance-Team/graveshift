import { GraveshiftError } from '@graveshift/core';

import type { GitHubClient } from './client';
import { unsafePath } from './guard';

export class SourceError extends GraveshiftError<'SOURCE_UNAVAILABLE'> {
  constructor(message: string) {
    super('SOURCE_UNAVAILABLE', message);
  }
}

const MAX_FILE_BYTES = 1_048_576;
const MAX_TREE_FILES = 5_000;
/** Total blob bytes one base read may hold in memory. */
export const MAX_TOTAL_SOURCE_BYTES = 32 * 1_048_576;

export interface SourceFile {
  readonly path: string;
  readonly blobSha: string;
  /** Exact blob bytes for the sandbox checkout. */
  readonly bytes: Uint8Array;
  /** Decoded text for the prompt and the diff apply; null when the blob is not text. */
  readonly text: string | null;
}

/** The base tree pinned at one commit. Nothing in it can move underneath the fix. */
export interface BaseSnapshot {
  readonly baseSha: string;
  readonly treeSha: string;
  readonly files: readonly SourceFile[];
}

/**
 * Reads the real repository at the base ref. The seam keeps the fix path
 * testable: tests inject a fake; production uses the GitHub App client.
 */
export interface SourceProvider {
  readBase(repo: string, branch: string): Promise<BaseSnapshot>;
  /** Current ref target for the stale-base re-check before publishing. */
  currentBaseSha(repo: string, branch: string): Promise<string>;
}

const isText = (bytes: Uint8Array): boolean => {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
};

// Real repository read through the injected GitHub App client. It only reads:
// every failure throws, so the fix fails closed instead of continuing on
// partial source.
export function createGitHubSourceProvider(client: GitHubClient): SourceProvider {
  return {
    async readBase(repo, branch) {
      const baseSha = await client.getBaseSha(repo, branch);
      const treeSha = await client.getCommitTree(repo, baseSha);
      const entries = await client.listTree(repo, treeSha);
      if (entries.length > MAX_TREE_FILES) {
        throw new SourceError(`tree has ${entries.length} files over the ${MAX_TREE_FILES} cap`);
      }
      for (const entry of entries) {
        if (unsafePath(entry.path)) {
          throw new SourceError(`unsafe path in base tree: ${entry.path}`);
        }
      }
      const seen = new Set<string>();
      const unique = entries.filter((entry) => {
        if (seen.has(entry.path)) {
          throw new SourceError(`duplicate path in base tree: ${entry.path}`);
        }
        seen.add(entry.path);
        return true;
      });
      // Blobs are read one at a time into one array: a recursive tree can hold
      // thousands of files, a bounded sequence keeps the request pressure on
      // GitHub low, and the total stays under a fixed byte budget.
      const files: SourceFile[] = [];
      let totalBytes = 0;
      const readFrom = async (index: number): Promise<void> => {
        if (index >= unique.length) return;
        const entry = unique[index]!;
        const bytes = await client.getBlobBytes(repo, entry.blobSha);
        if (bytes.byteLength > MAX_FILE_BYTES) {
          throw new SourceError(`${entry.path}: blob exceeds ${MAX_FILE_BYTES} bytes`);
        }
        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_TOTAL_SOURCE_BYTES) {
          throw new SourceError(
            `${entry.path}: tree exceeds the ${MAX_TOTAL_SOURCE_BYTES} byte total cap`,
          );
        }
        files.push({
          path: entry.path,
          blobSha: entry.blobSha,
          bytes,
          text: isText(bytes) ? new TextDecoder('utf-8').decode(bytes) : null,
        });
        return readFrom(index + 1);
      };
      await readFrom(0);
      return { baseSha, treeSha, files };
    },
    currentBaseSha(repo, branch) {
      return client.getBaseSha(repo, branch);
    },
  };
}
