export interface TreeEntry {
  path: string;
  sha: string | null;
}

/** One blob entry of a recursive tree listing. `path` is relative to the repo root. */
export interface TreeFile {
  readonly path: string;
  readonly blobSha: string;
}

export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

export interface PullRequestState {
  state: 'open' | 'closed';
  merged: boolean;
  headSha: string;
}

// Deliberately has no merge method: the fixer cannot merge because the client cannot.
export interface GitHubClient {
  getBaseSha(repo: string, branch: string): Promise<string>;
  getCommitTree(repo: string, commitSha: string): Promise<string>;
  /** Full recursive file listing of one tree. Directory entries are not returned. */
  listTree(repo: string, treeSha: string): Promise<TreeFile[]>;
  /** Raw bytes of one blob, read by SHA. */
  getBlobBytes(repo: string, blobSha: string): Promise<Uint8Array>;
  createBlob(repo: string, content: string): Promise<string>;
  createTree(repo: string, baseTree: string, entries: TreeEntry[]): Promise<string>;
  createCommit(repo: string, message: string, tree: string, parent: string): Promise<string>;
  createRef(repo: string, ref: string, sha: string): Promise<void>;
  createPullRequest(
    repo: string,
    pr: { title: string; body: string; head: string; base: string; draft: true },
  ): Promise<{ number: number; url: string }>;
  addLabels(repo: string, number: number, labels: string[]): Promise<void>;
  listCheckRuns(repo: string, sha: string): Promise<CheckRun[]>;
  getPullRequest(repo: string, number: number): Promise<PullRequestState>;
}
