export interface TreeEntry {
  path: string;
  sha: string | null;
  mode?: '100644' | '100755';
}

export interface SourceEntry {
  path: string;
  blobSha: string;
  mode: string;
  size?: number;
}

// Deliberately has no merge method: the fixer cannot merge because the client cannot.
export interface GitHubClient {
  getBaseSha(repo: string, branch: string): Promise<string>;
  getCommitTree(repo: string, commitSha: string): Promise<string>;
  getTree(repo: string, treeSha: string): Promise<SourceEntry[]>;
  readBlob(repo: string, sha: string): Promise<string>;
  getExistingDraft(repo: string, branch: string, baseSha: string): Promise<PrRef | undefined>;
  createBlob(repo: string, content: string): Promise<string>;
  createTree(repo: string, baseTree: string, entries: TreeEntry[]): Promise<string>;
  createCommit(repo: string, message: string, tree: string, parent: string): Promise<string>;
  createRef(repo: string, ref: string, sha: string): Promise<void>;
  createPullRequest(
    repo: string,
    pr: { title: string; body: string; head: string; base: string; draft: true },
  ): Promise<{ number: number; url: string }>;
  addLabels(repo: string, number: number, labels: string[]): Promise<void>;
}
import type { PrRef } from './types';
