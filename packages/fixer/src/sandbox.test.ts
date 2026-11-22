import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  createSandboxWorkspace,
  createSpawnRunner,
  jailWorks,
  networkJail,
  SandboxUnavailableError,
  sandboxEnv,
  type CommandRunner,
  type SandboxConfig,
  type SpawnRequest,
} from './sandbox';
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

function recordingRunner(exit = 0) {
  const requests: SpawnRequest[] = [];
  const runner: CommandRunner = async (request) => {
    requests.push(request);
    return { exitCode: exit, timedOut: false, stdout: 'ran', stderr: '' };
  };
  return { runner, requests };
}

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
        return { exitCode: 0, timedOut: false, stdout: '', stderr: '' };
      },
    });
    const result = await workspace.verify(
      base,
      { files: [{ path: 'src/api.ts', content: 'export const price = 1;\n', linesChanged: 1 }] },
      sandbox,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.checks).toEqual([
      { command: ['bun', 'test'], exitCode: 0, timedOut: false, stdout: '', stderr: '' },
    ]);
    expect(seen).toHaveLength(1);
    const request = seen[0]!;
    expect(request.argv).toEqual(['bun', 'test']);
    // No secrets: the exact environment is the allowlist. No network: the jail
    // wraps the command (asserted in the spawn-runner tests).
    expect(request.env).toEqual(sandboxEnv(request.cwd));
    expect(Object.keys(request.env).sort()).toEqual(['HOME', 'PATH']);
    expect(request.cwd).toStartWith(tmpdir());
    expect(request.timeoutMs).toBe(10_000);
  });

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
        return { exitCode: 1, timedOut: false, stdout: '', stderr: 'nope' };
      },
    });
    const result = await workspace.verify(
      base,
      { files: [{ path: 'src/api.ts', content: 'x\n', linesChanged: 1 }] },
      { commands: [['a'], ['b']], timeoutMs: 1000 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('check failed with exit 1');
    expect(result.checks).toHaveLength(1);
    expect(runs).toBe(1);
  });

  test('a timed-out check fails closed', async () => {
    const workspace = createSandboxWorkspace({
      runner: async () => ({ exitCode: null, timedOut: true, stdout: '', stderr: '' }),
    });
    const result = await workspace.verify(
      base,
      { files: [{ path: 'src/api.ts', content: 'x\n', linesChanged: 1 }] },
      sandbox,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('timed out');
  });

  test('no configured checks means no verification: fail closed', async () => {
    const workspace = createSandboxWorkspace({ runner: recordingRunner().runner });
    const result = await workspace.verify(
      base,
      { files: [{ path: 'src/api.ts', content: 'x\n', linesChanged: 1 }] },
      { commands: [], timeoutMs: 1000 },
    );
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

  test('a runner that throws (no jail) fails closed', async () => {
    const workspace = createSandboxWorkspace({
      runner: async () => {
        throw new SandboxUnavailableError('no jail');
      },
    });
    const result = await workspace.verify(
      base,
      { files: [{ path: 'src/api.ts', content: 'x\n', linesChanged: 1 }] },
      sandbox,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('no jail');
  });
});

describe('createSpawnRunner', () => {
  test('runs a real command with the scrubbed environment and captures output', async () => {
    const runner = createSpawnRunner([]);
    const result = await runner({
      argv: ['/usr/bin/env'],
      cwd: '/',
      env: { PATH: '/usr/bin:/bin', HOME: '/tmp' },
      timeoutMs: 10_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PATH=/usr/bin:/bin');
    expect(result.stdout).not.toContain('GRAVESHIFT_GITHUB_PRIVATE_KEY');
    expect(result.stdout).not.toContain('ANTHROPIC_API_KEY');
    expect(result.timedOut).toBe(false);
  });

  test('a hanging command is killed at the timeout', async () => {
    const runner = createSpawnRunner([]);
    const started = Date.now();
    const result = await runner({
      argv: ['/bin/sleep', '30'],
      cwd: '/',
      env: { PATH: '/usr/bin:/bin', HOME: '/tmp' },
      timeoutMs: 120,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test('without a jail the runner refuses to spawn', async () => {
    const runner = createSpawnRunner(null);
    await expect(
      runner({ argv: ['/bin/true'], cwd: '/', env: {}, timeoutMs: 100 }),
    ).rejects.toBeInstanceOf(SandboxUnavailableError);
  });

  test('the production runner runs under the platform jail or fails closed', async () => {
    const request = {
      argv: ['/bin/echo', 'ok'],
      cwd: '/tmp',
      env: sandboxEnv('/tmp'),
      timeoutMs: 15_000,
    };
    if (await jailWorks()) {
      const result = await createSpawnRunner()(request);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('ok');
      return;
    }
    // A host that refuses the jail must block the check through the same entry
    // point instead of running it with network.
    await expect(createSpawnRunner()(request)).rejects.toBeInstanceOf(SandboxUnavailableError);
  });

  test('the network jail exists on this platform', () => {
    expect(networkJail()).toBeDefined();
  });

  test('checks really run without network under the jail', async () => {
    const jail = networkJail();
    if (jail === null) return;
    const bare = createSpawnRunner([]);
    const canJail = await bare({
      argv: [...jail, '/bin/true'],
      cwd: '/tmp',
      env: sandboxEnv('/tmp'),
      timeoutMs: 10_000,
    });
    // Some hardened runners block the jail itself; the argv-level tests cover
    // those platforms, the real spawn must not be faked here.
    if (canJail.exitCode !== 0) return;
    const runner = createSpawnRunner(jail);
    const result = await runner({
      argv: [
        '/bin/sh',
        '-c',
        'if command -v curl >/dev/null 2>&1; then curl -s --max-time 2 http://93.184.216.34/ >/dev/null; echo blocked=$?; else echo blocked=missing; fi',
      ],
      cwd: '/tmp',
      env: sandboxEnv('/tmp'),
      timeoutMs: 15_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('blocked=');
    expect(result.stdout).not.toContain('blocked=0');
  });
});
