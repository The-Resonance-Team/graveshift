import { createHash } from 'node:crypto';

import type { SourceEntry } from './client';
import type { SandboxRunner } from './sandbox';
import { fakeClient } from './test-helpers';

export const gitBlob = (content: string) =>
  createHash('sha1')
    .update(`blob ${Buffer.byteLength(content)}\0`)
    .update(content)
    .digest('hex');

export const gitRunner: SandboxRunner = async (request) => {
  if (request.argv[0] !== 'git' || !request.noNetwork)
    throw new Error('expected a local Git command');
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

export function sourceClient(
  contents: Record<string, string> = { 'src/app.ts': 'const price = null;\n' },
) {
  const { client, calls } = fakeClient();
  const entries: SourceEntry[] = Object.entries(contents).map(([path, content]) => ({
    path,
    blobSha: gitBlob(content),
    mode: '100644',
    size: Buffer.byteLength(content),
  }));
  const record = (method: string, ...args: unknown[]) => calls.push({ method, args });
  client.getCommitTree = async (...args) => {
    record('getCommitTree', ...args);
    return 'tree-sha';
  };
  client.getTree = async (...args) => {
    record('getTree', ...args);
    return entries;
  };
  client.readBlob = async (...args) => {
    record('readBlob', ...args);
    const entry = Object.entries(contents).find(([, content]) => gitBlob(content) === args[1]);
    if (!entry) throw new Error('missing blob');
    return entry[1];
  };
  return { client, calls, entries };
}
