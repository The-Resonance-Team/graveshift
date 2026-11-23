import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { createSandboxWorkspace, type SandboxConfig } from './sandbox';
import {
  createSpawnRunner,
  SandboxUnavailableError,
  sandboxEnv,
  SANDBOX_ENV_ALLOWLIST,
  type CommandRunner,
  type SpawnOutcome,
  type SpawnRequest,
} from './spawn';

/**
 * Two tests here run a check through the production spawn runner, so they get a
 * budget well above bun's 5 s default per-test limit.
 */
const REAL_SUBPROCESS_TIMEOUT_MS = 30_000;
import type { BaseSnapshot } from './source';

const sandbox: SandboxConfig = {
  commands: [['bun', 'test']],
  timeoutMs: 10_000,
};

const base: BaseSnapshot = {
  baseSha: 'base-sha',
  treeSha: 'tree-sha',
  files: [
    {
      path: 'src/api.ts',
      blobSha: 'blob-api',
      bytes: new TextEncoder().encode('export const price = null;\n'),
      text: 'export const price = null;\n',
    },
    {
      path: 'docs/note.md',
      blobSha: 'blob-note',
      bytes: new TextEncoder().encode('# note\n'),
      text: '# note\n',
    },
  ],
};

const outcome = (over: Partial<SpawnOutcome> = {}): SpawnOutcome => ({
  exitCode: 0,
  timedOut: false,
  stdout: '',
  stderr: '',
  stdoutTruncated: false,
  stderrTruncated: false,
  ...over,
});

function recordingRunner(exit = 0) {
  const requests: SpawnRequest[] = [];
  const runner: CommandRunner = async (request) => {
    requests.push(request);
    return outcome({ exitCode: exit, stdout: 'ran' });
  };
  return { runner, requests };
}

/** The host's own bun directory: the owner-set PATH entry a real check needs. */
const bunDir = dirname(process.execPath);
const bunName = process.execPath.slice(bunDir.length + 1);

const patchFile = (content: string | null) => ({
  files: [{ path: 'src/api.ts', content, linesChanged: 1 }],
});

describe('createSandboxWorkspace', () => {
  test('checks out the base tree, applies the patch and runs every command sandboxed', async () => {
    const seen: SpawnRequest[] = [];
    const workspace = createSandboxWorkspace({
      runner: async (request) => {
        seen.push(request);
        const written = await readFile(join(request.cwd, 'src/api.ts'), 'utf8');
        expect(written).toBe('export const price = 1;\n');
        const untouched = await readFile(join(request.cwd, 'docs/note.md'), 'utf8');
        expect(untouched).toBe('# note\n');
        return outcome();
      },
    });
    const result = await workspace.verify(base, patchFile('export const price = 1;\n'), sandbox);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.checks).toEqual([
      {
        command: ['bun', 'test'],
        exitCode: 0,
        timedOut: false,
        stdout: '',
        stderr: '',
        stdoutTruncated: false,
        stderrTruncated: false,
      },
    ]);
    expect(seen).toHaveLength(1);
    const request = seen[0]!;
    expect(request.argv).toEqual(['bun', 'test']);
    // No secrets: the environment is the built PATH/HOME pair plus the named
    // non-secret allowlist, never the host environment. No network: the jail
    // wraps the command (asserted in the spawn-runner tests).
    expect(request.env).toEqual(sandboxEnv(request.cwd));
    expect(request.env.PATH).toBe('/usr/bin:/bin');
    expect(request.env.HOME).toBe(request.cwd);
    for (const name of Object.keys(request.env)) {
      expect(['PATH', 'HOME', ...SANDBOX_ENV_ALLOWLIST]).toContain(name);
      expect(name).not.toMatch(/KEY|TOKEN|SECRET|PASSWORD/);
    }
    expect(request.cwd).toStartWith(tmpdir());
    expect(request.timeoutMs).toBe(10_000);
  });

  test('the PATH is the system directories plus the owner-set runtime directories', async () => {
    const { runner, requests } = recordingRunner();
    const workspace = createSandboxWorkspace({ runner });
    await workspace.verify(base, patchFile('x\n'), {
      commands: [['bun', 'check']],
      timeoutMs: 1_000,
      pathDirs: ['/opt/tools/bin', ' /usr/local/bin ', '/opt/tools/bin'],
    });
    // Fixed order, no host PATH, no duplicates of the system directories.
    expect(requests[0]!.env.PATH).toBe('/usr/bin:/bin:/opt/tools/bin:/usr/local/bin');
  });

  test(
    'a check whose program is outside the sandbox PATH cannot start and blocks the fix',
    async () => {
      const workspace = createSandboxWorkspace({
        createRunner: () => createSpawnRunner([]),
      });
      const result = await workspace.verify(base, patchFile('x\n'), {
        commands: [[bunName, '--version']],
        timeoutMs: 10_000,
        pathDirs: [],
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toContain('not found');
      expect(result.checks).toHaveLength(1);
      expect(result.checks[0]!.exitCode).toBeNull();
    },
    REAL_SUBPROCESS_TIMEOUT_MS,
  );

  test(
    'the same check runs once the owner-set directory is on the sandbox PATH',
    async () => {
      const workspace = createSandboxWorkspace({
        createRunner: () => createSpawnRunner([]),
      });
      const result = await workspace.verify(base, patchFile('x\n'), {
        commands: [[bunName, '--version']],
        timeoutMs: 10_000,
        pathDirs: [bunDir],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.checks[0]!.exitCode).toBe(0);
      expect(result.checks[0]!.stdout).toMatch(/\d+\.\d+/);
    },
    REAL_SUBPROCESS_TIMEOUT_MS,
  );

  test('deleted files are removed before checks run', async () => {
    const { runner, requests } = recordingRunner();
    const workspace = createSandboxWorkspace({ runner });
    const result = await workspace.verify(
      base,
      { files: [{ path: 'docs/note.md', content: null, linesChanged: 1 }] },
      sandbox,
    );
    expect(result.ok).toBe(true);
    const cwd = requests[0]!.cwd;
    await expect(readFile(join(cwd, 'docs/note.md'), 'utf8')).rejects.toThrow();
  });

  test('a failed check blocks the run and stops later commands', async () => {
    let runs = 0;
    const workspace = createSandboxWorkspace({
      runner: async () => {
        runs++;
        return outcome({ exitCode: 1, stderr: 'nope' });
      },
    });
    const result = await workspace.verify(base, patchFile('x\n'), {
      commands: [['a'], ['b']],
      timeoutMs: 1000,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('check failed with exit 1');
    expect(result.checks).toHaveLength(1);
    expect(runs).toBe(1);
  });

  test('check output is redacted before it is kept for the audit trail', async () => {
    const secret = `sk-ant-api03-${'AbCdEfGhIjKlMnOpQrStUvWx'.repeat(2)}`;
    const workspace = createSandboxWorkspace({
      runner: async () => outcome({ stdout: `token ${secret} leaked` }),
    });
    const result = await workspace.verify(base, patchFile('x\n'), sandbox);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.checks[0]!.stdout).not.toContain(secret);
  });

  test('a timed-out check fails closed', async () => {
    const workspace = createSandboxWorkspace({
      runner: async () => outcome({ exitCode: null, timedOut: true }),
    });
    const result = await workspace.verify(base, patchFile('x\n'), sandbox);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('timed out');
  });

  test('no configured checks means no verification: fail closed', async () => {
    const workspace = createSandboxWorkspace({ runner: recordingRunner().runner });
    const result = await workspace.verify(base, patchFile('x\n'), {
      commands: [],
      timeoutMs: 1000,
    });
    expect(result).toEqual({ ok: false, reason: 'no_check_commands_configured', checks: [] });
  });

  test('an unsafe patch path is rejected before checks', async () => {
    const { runner, requests } = recordingRunner();
    const workspace = createSandboxWorkspace({ runner });
    const result = await workspace.verify(
      base,
      { files: [{ path: '../escape', content: 'x\n', linesChanged: 1 }] },
      sandbox,
    );
    expect(result.ok).toBe(false);
    expect(requests).toHaveLength(0);
  });

  test('a runner that throws (no jail) fails closed and still records the check', async () => {
    const workspace = createSandboxWorkspace({
      runner: async () => {
        throw new SandboxUnavailableError('no jail');
      },
    });
    const result = await workspace.verify(base, patchFile('x\n'), sandbox);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('no jail');
    // The audit trail is complete: the check that could not run is recorded.
    expect(result.checks).toHaveLength(1);
    const check = result.checks[0]!;
    expect(check.command).toEqual(['bun', 'test']);
    expect(check.exitCode).toBeNull();
    expect(check.timedOut).toBe(false);
    expect(check.stderr).toContain('check runner failed');
    expect(check.stderr).toContain('no jail');
  });
});
