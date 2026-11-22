import { createHash } from 'node:crypto';
import type { GitHubClient, SandboxRunner } from '@graveshift/fixer';

const content = 'export const state = "broken";\n';
const blobSha = createHash('sha1')
  .update(`blob ${Buffer.byteLength(content)}\0`)
  .update(content)
  .digest('hex');

export const gitChecks: SandboxRunner = async (request) => {
  if (request.argv[0] !== 'git' || !request.noNetwork)
    throw new Error('Only local Git commands are recorded');
  const child = Bun.spawn([...request.argv], {
    cwd: request.cwd,
    env: { ...request.env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
    timeout: request.timeoutMs,
    killSignal: 'SIGKILL',
  });
  const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  return { exitCode, stdout, timedOut: child.signalCode !== null };
};

export function githubRecording() {
  const calls: string[] = [];
  const writes: unknown[] = [];
  const client: GitHubClient = {
    getBaseSha: async () => {
      calls.push('base');
      return 'base-sha';
    },
    getCommitTree: async () => {
      calls.push('tree');
      return 'tree-sha';
    },
    getTree: async () => [{ path: 'src/main.ts', blobSha, mode: '100644' }],
    readBlob: async () => {
      calls.push('source');
      return content;
    },
    getExistingDraft: async () => {
      calls.push('recover');
      return undefined;
    },
    createBlob: async (_repo, text) => {
      writes.push(text);
      return 'new-blob';
    },
    createTree: async (_repo, _tree, entries) => {
      writes.push(entries);
      return 'new-tree';
    },
    createCommit: async (_repo, message, _tree, base) => {
      writes.push({ message, base });
      return 'head-sha';
    },
    createRef: async (_repo, branch) => {
      writes.push({ branch });
    },
    createPullRequest: async (_repo, pull) => {
      writes.push(pull);
      return { number: 8, url: 'https://github.com/team/grave/pull/8' };
    },
    addLabels: async () => {
      throw new Error('Optional labels failed');
    },
  };
  return { client, calls, writes };
}
