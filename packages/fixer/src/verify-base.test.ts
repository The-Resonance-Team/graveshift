import { chmod, rename, symlink, writeFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import type { SandboxRunner } from './sandbox';
import { prepareSource } from './source';
import { gitBlob, gitRunner, sourceClient } from './source.test-helpers';
import { repo, TEST_BASE_SHA } from './test-helpers';
import { verifyPatch } from './verify';

const proposed = () => ({
  baseSha: TEST_BASE_SHA,
  files: [
    {
      path: 'src/app.ts',
      content: 'after\n',
      linesChanged: 1,
      baseBlobSha: gitBlob('const price = null;\n'),
    },
  ],
});

const STALE_SHA = 'd'.repeat(40);

test('a stale patch base blocks before a workspace or runner starts', async () => {
  const { client } = sourceClient();
  const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
  let runs = 0;
  const runner: SandboxRunner = async (request) => {
    runs++;
    return gitRunner(request);
  };
  await expect(
    verifyPatch({
      snapshot,
      patch: { ...proposed(), baseSha: STALE_SHA },
      commands: [['git', 'diff', '--check']],
      timeoutMs: 10_000,
      runner,
    }),
  ).rejects.toMatchObject({ code: 'STALE_BASE' });
  expect(runs).toBe(0);
});

test('a stale file blob blocks before a workspace or runner starts', async () => {
  const { client } = sourceClient();
  const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
  let runs = 0;
  const runner: SandboxRunner = async (request) => {
    runs++;
    return gitRunner(request);
  };
  await expect(
    verifyPatch({
      snapshot,
      patch: { ...proposed(), files: [{ ...proposed().files[0]!, baseBlobSha: STALE_SHA }] },
      commands: [['git', 'diff', '--check']],
      timeoutMs: 10_000,
      runner,
    }),
  ).rejects.toMatchObject({ code: 'STALE_BASE' });
  expect(runs).toBe(0);
});

test('an addition against a non-empty base blob is rejected', async () => {
  const { client } = sourceClient();
  const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
  await expect(
    verifyPatch({
      snapshot,
      patch: {
        baseSha: TEST_BASE_SHA,
        files: [{ path: 'src/new.ts', content: 'new\n', linesChanged: 1, baseBlobSha: STALE_SHA }],
      },
      commands: [['git', 'diff', '--check']],
      timeoutMs: 10_000,
      runner: gitRunner,
    }),
  ).rejects.toMatchObject({ code: 'STALE_BASE' });
});

test('a passing check cannot replace the proposed source with different content', async () => {
  const { client } = sourceClient();
  const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
  const runner: SandboxRunner = async (request) => {
    if (request.argv[0] !== 'fixture-check') return gitRunner(request);
    await writeFile(`${request.cwd}/src/app.ts`, 'unchecked output\n');
    return { exitCode: 0, stdout: '', timedOut: false };
  };
  await expect(
    verifyPatch({
      snapshot,
      patch: proposed(),
      commands: [['fixture-check']],
      timeoutMs: 10_000,
      runner,
    }),
  ).rejects.toMatchObject({ code: 'CHECK_FAILED', message: 'check modified the proposed source' });
});

test('a check cannot replace the workspace root with a symlink for the parent to follow', async () => {
  const { client } = sourceClient();
  const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
  const runner: SandboxRunner = async (request) => {
    if (request.argv[0] !== 'fixture-check') return gitRunner(request);
    await rename(request.cwd, `${request.root}/saved`);
    await symlink(`${request.root}/saved`, request.cwd);
    return { exitCode: 0, stdout: '', timedOut: false };
  };
  await expect(
    verifyPatch({
      snapshot,
      patch: proposed(),
      commands: [['fixture-check']],
      timeoutMs: 10_000,
      runner,
    }),
  ).rejects.toMatchObject({
    code: 'CHECK_FAILED',
    message: 'workspace root is not an isolated directory',
  });
});

test('a passing check cannot change a file mode that publication would preserve', async () => {
  const { client } = sourceClient();
  const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
  const runner: SandboxRunner = async (request) => {
    if (request.argv[0] !== 'fixture-check') return gitRunner(request);
    await chmod(`${request.cwd}/src/app.ts`, 0o700);
    return { exitCode: 0, stdout: '', timedOut: false };
  };
  await expect(
    verifyPatch({
      snapshot,
      patch: proposed(),
      commands: [['fixture-check']],
      timeoutMs: 10_000,
      runner,
    }),
  ).rejects.toMatchObject({ code: 'CHECK_FAILED', message: 'check modified the proposed source' });
});
