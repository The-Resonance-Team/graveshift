import { access, readFile, symlink } from 'node:fs/promises';
import { dirname } from 'node:path';

import { EMPTY_BLOB_SHA } from '@graveshift/patch';
import { expect, test } from 'bun:test';

import type { SandboxRunner } from './sandbox';
import { prepareSource } from './source';
import { gitBlob, gitRunner, sourceClient } from './source.test-helpers';
import { repo, TEST_BASE_SHA, TEST_BLOB_SHA } from './test-helpers';
import { verifyPatch } from './verify';

test('the production verifier runs configured Git checks inside the platform sandbox', async () => {
  const { client } = sourceClient();
  const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
  try {
    const verified = await verifyPatch({
      snapshot,
      patch: {
        baseSha: TEST_BASE_SHA,
        files: [
          {
            path: 'src/app.ts',
            content: 'const price = 0;\n',
            linesChanged: 0,
            baseBlobSha: gitBlob('const price = null;\n'),
          },
        ],
      },
      commands: [['git', 'diff', '--check']],
      timeoutMs: 10_000,
    });
    expect(verified.checks).toMatchObject([{ command: ['git', 'diff', '--check'], exitCode: 0 }]);
  } catch (error) {
    if (process.platform === 'darwin') throw error;
    expect(error).toMatchObject({ code: 'SANDBOX_UNAVAILABLE' });
  }
});

test('uses actual file changes and checks real patched files in a private workspace', async () => {
  const { client } = sourceClient({ 'src/app.ts': 'before\n', 'src/remove.ts': 'remove\n' });
  const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
  let workspace = '';
  let checks = 0;
  const runner: SandboxRunner = async (request) => {
    workspace = request.root;
    expect(request.noNetwork).toBe(true);
    expect(Object.keys(request.env).some((key) => /TOKEN|SECRET|API_KEY|SSH|AUTH/i.test(key))).toBe(
      false,
    );
    expect(request.env.HOME).toStartWith(request.root);
    // The runtime directory may live under HOME (setup-bun installs Bun there).
    // Only a host-home path outside that runtime directory is a leak.
    const hostHome = process.env.HOME ?? '/missing-home';
    const runtimeDir = dirname(process.execPath);
    expect(request.env.PATH).toBeDefined();
    expect(
      (request.env.PATH ?? '')
        .split(':')
        .filter((entry) => entry.startsWith(hostHome) && entry !== runtimeDir),
    ).toEqual([]);
    if (request.argv[0] !== 'fixture-check') return gitRunner(request);
    checks++;
    expect(await readFile(`${request.cwd}/src/app.ts`, 'utf8')).toBe('after\n');
    expect(await readFile(`${request.cwd}/src/new.ts`, 'utf8')).toBe('new\n');
    await expect(access(`${request.cwd}/src/remove.ts`)).rejects.toThrow();
    return { exitCode: 0, stdout: '', timedOut: false };
  };
  const verified = await verifyPatch({
    snapshot,
    patch: {
      baseSha: TEST_BASE_SHA,
      files: [
        {
          path: 'src/app.ts',
          content: 'after\n',
          linesChanged: 0,
          baseBlobSha: gitBlob('before\n'),
        },
        { path: 'src/remove.ts', content: null, linesChanged: 0, baseBlobSha: null },
        { path: 'src/new.ts', content: 'new\n', linesChanged: 0, baseBlobSha: EMPTY_BLOB_SHA },
      ],
    },
    commands: [['fixture-check']],
    timeoutMs: 10_000,
    runner,
  });
  expect(verified.patch.files.map((file) => file.linesChanged)).toEqual([2, 1, 1]);
  expect(verified.diff).toContain('-before\n+after');
  expect(verified.changes).toContainEqual({ path: 'src/remove.ts', added: 0, deleted: 1 });
  expect(verified.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
  expect(verified.patchHash).toMatch(/^[a-f0-9]{64}$/);
  expect(checks).toBe(1);
  expect(verified.checks).toMatchObject([{ command: ['fixture-check'], exitCode: 0 }]);
  await expect(access(workspace)).rejects.toThrow();
});

test('a failed check stops verification and cleans up the workspace', async () => {
  const { client } = sourceClient();
  const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
  let workspace = '';
  const runner: SandboxRunner = async (request) => {
    workspace = request.root;
    if (request.argv[0] !== 'fixture-check') return gitRunner(request);
    return { exitCode: 1, stdout: 'TOKEN=private-check-output', timedOut: false };
  };
  await expect(
    verifyPatch({
      snapshot,
      patch: {
        baseSha: TEST_BASE_SHA,
        files: [
          {
            path: 'src/app.ts',
            content: 'after\n',
            linesChanged: 1,
            baseBlobSha: gitBlob('const price = null;\n'),
          },
        ],
      },
      commands: [['fixture-check']],
      timeoutMs: 10_000,
      runner,
    }),
  ).rejects.toMatchObject({
    code: 'CHECK_FAILED',
    message: 'verification command failed',
  });
  await expect(access(workspace)).rejects.toThrow();
});

test('a symlink created before application is rejected without writing its target', async () => {
  const { client } = sourceClient();
  const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
  let outside = '';
  const runner: SandboxRunner = async (request) => {
    const result = await gitRunner(request);
    if (request.argv.includes('commit')) {
      outside = `${request.root}/home/escaped.ts`;
      await symlink(outside, `${request.cwd}/src/new.ts`);
    }
    return result;
  };
  await expect(
    verifyPatch({
      snapshot,
      patch: {
        baseSha: TEST_BASE_SHA,
        files: [
          { path: 'src/new.ts', content: 'escape', linesChanged: 1, baseBlobSha: EMPTY_BLOB_SHA },
        ],
      },
      commands: [['git', 'diff', '--check']],
      timeoutMs: 10_000,
      runner,
    }),
  ).rejects.toMatchObject({
    code: 'CHECK_FAILED',
    message: 'workspace contains a symlink',
  });
  await expect(access(outside)).rejects.toThrow();
});

test('forbidden paths and missing commands fail before a runner is called', async () => {
  const { client } = sourceClient();
  const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
  let runs = 0;
  const runner: SandboxRunner = async () => {
    runs++;
    return { exitCode: 0, stdout: '', timedOut: false };
  };
  await expect(
    verifyPatch({
      snapshot,
      patch: {
        baseSha: TEST_BASE_SHA,
        files: [
          { path: 'src/.env', content: 'secret', linesChanged: 1, baseBlobSha: TEST_BLOB_SHA },
        ],
      },
      commands: [['git', 'diff', '--check']],
      timeoutMs: 1000,
      runner,
    }),
  ).rejects.toMatchObject({ code: 'PATCH_REJECTED' });
  await expect(
    verifyPatch({
      snapshot,
      patch: {
        baseSha: TEST_BASE_SHA,
        files: [
          {
            path: 'src/app.ts',
            content: 'after',
            linesChanged: 1,
            baseBlobSha: gitBlob('const price = null;\n'),
          },
        ],
      },
      commands: [],
      timeoutMs: 1000,
      runner,
    }),
  ).rejects.toMatchObject({ code: 'CHECK_FAILED' });
  expect(runs).toBe(0);
});

test('a deletion uses the real base size when the proposal reports zero changed lines', async () => {
  const { client } = sourceClient({ 'src/app.ts': 'line\n'.repeat(201) });
  const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
  await expect(
    verifyPatch({
      snapshot,
      patch: {
        baseSha: TEST_BASE_SHA,
        files: [{ path: 'src/app.ts', content: null, linesChanged: 0, baseBlobSha: null }],
      },
      commands: [['git', 'diff', '--check']],
      timeoutMs: 10_000,
      runner: gitRunner,
    }),
  ).rejects.toMatchObject({
    code: 'PATCH_REJECTED',
    reasons: ['201 lines exceeds maxLinesChanged 200'],
  });
});

test('can verify deletion of the only selected file', async () => {
  const { client } = sourceClient({ 'src/app.ts': 'before\n' });
  const snapshot = await prepareSource(repo, client, TEST_BASE_SHA);
  const verified = await verifyPatch({
    snapshot,
    patch: {
      baseSha: TEST_BASE_SHA,
      files: [{ path: 'src/app.ts', content: null, linesChanged: 0, baseBlobSha: null }],
    },
    commands: [['git', 'diff', '--check']],
    timeoutMs: 10_000,
    runner: gitRunner,
  });
  expect(verified.changes).toEqual([{ path: 'src/app.ts', added: 0, deleted: 1 }]);
});

test('tree metadata rejects a new descendant of an excluded symlink before any runner call', async () => {
  const { client, entries } = sourceClient({ 'src/app.ts': 'before\n', 'src/link': 'outside' });
  const link = entries.find((entry) => entry.path === 'src/link');
  if (!link) throw new Error('missing link entry');
  link.mode = '120000';
  const snapshot = await prepareSource(
    { ...repo, forbiddenPaths: [...repo.forbiddenPaths, 'src/link'] },
    client,
    TEST_BASE_SHA,
  );
  let runs = 0;
  const runner: SandboxRunner = async (request) => {
    runs++;
    return gitRunner(request);
  };
  await expect(
    verifyPatch({
      snapshot,
      patch: {
        baseSha: TEST_BASE_SHA,
        files: [
          {
            path: 'src/link/escaped.ts',
            content: 'escape',
            linesChanged: 1,
            baseBlobSha: EMPTY_BLOB_SHA,
          },
        ],
      },
      commands: [['git', 'diff', '--check']],
      timeoutMs: 10_000,
      runner,
    }),
  ).rejects.toMatchObject({ code: 'CHECK_FAILED' });
  expect(runs).toBe(0);
});
