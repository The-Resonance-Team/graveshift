// The committed graveshift.config.yaml ships the check commands every fix must
// pass before a pull request opens. These tests run those exact commands
// through the real sandbox: they must start on the owner's runtime, and a
// missing PATH entry must block the fix instead of failing open.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { DEFAULT_CONFIG_PATH, loadGraveshiftConfig } from '@graveshift/config';
import {
  createSandboxWorkspace,
  createSpawnRunner,
  jailWorks,
  networkJail,
  sandboxEnv,
  type CommandRunner,
  type SandboxConfig,
} from '@graveshift/fixer';

/**
 * These tests run the committed checks (`bun check`, `bun test`) as real
 * subprocesses, so they get a budget well above bun's 5 s default per-test limit.
 */
const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;

const committed = await loadGraveshiftConfig(DEFAULT_CONFIG_PATH);

const repoRoot = dirname(fileURLToPath(DEFAULT_CONFIG_PATH));

/**
 * The committed `fix.sandbox.pathDirs` are the only directories a check may look
 * in, so the runtime the committed commands name has to resolve through them.
 * The one documented case outside that list is a per-user runtime install:
 * `docs/SECURITY.md` tells a Linux owner to add its directory to the file. The
 * config itself never holds a tilde or a relative path, because the sandbox
 * builds its own environment and would not expand one.
 */
const perUserRuntimeDir = join(homedir(), '.bun', 'bin');

const runtimeDirsForHost = (): readonly string[] => {
  const committedDirs = committed.fix.sandbox.pathDirs;
  if (committedDirs.some((dir) => existsSync(join(dir, 'bun')))) return committedDirs;
  if (existsSync(join(perUserRuntimeDir, 'bun'))) return [...committedDirs, perUserRuntimeDir];
  throw new Error(
    `the check runtime is in neither the committed fix.sandbox.pathDirs ` +
      `(${committedDirs.join(', ')}) nor the documented per-user directory ` +
      `${perUserRuntimeDir}: add the directory that holds \`bun\` to fix.sandbox.pathDirs`,
  );
};

/**
 * The committed suite starts every check as a real subprocess through the
 * production spawn runner. A host that blocks user namespaces (GitHub-hosted
 * Ubuntu) has no jail that can start, so there the checks run without the jail
 * prefix. `packages/fixer/src/spawn.test.ts` holds the jail contract.
 */
async function hostRunner(): Promise<CommandRunner> {
  const jail = networkJail();
  // ponytail: no jail on a host that blocks user namespaces; upgrade when CI
  // gives the job an unprivileged jail, then drop the second branch
  return (await jailWorks(jail))
    ? createSpawnRunner(jail ?? undefined)
    : createSpawnRunner(null, { requireJail: false });
}

const runner = await hostRunner();

const bunDir = dirname(process.execPath);

// A throwaway project the committed commands can check: valid TypeScript plus
// one passing test, so a green run means both commands really ran.
const project = () => ({
  baseSha: 'base-sha',
  treeSha: 'tree-sha',
  files: [
    {
      path: 'src/app.ts',
      blobSha: 'blob-app',
      bytes: new TextEncoder().encode(
        'export const price = 1;\nexport const total = (): number => price * 2;\n',
      ),
      text: 'export const price = 1;\nexport const total = (): number => price * 2;\n',
    },
    {
      path: 'src/app.test.js',
      blobSha: 'blob-test',
      bytes: new TextEncoder().encode(
        'import { expect, test } from "bun:test";\nimport { total } from "./app.ts";\n\ntest("total doubles", () => {\n  expect(total()).toBe(2);\n});\n',
      ),
      text: 'import { expect, test } from "bun:test";\nimport { total } from "./app.ts";\n\ntest("total doubles", () => {\n  expect(total()).toBe(2);\n});\n',
    },
  ],
});

const patched = {
  files: [{ path: 'src/extra.ts', content: 'export const extra = 1;\n', linesChanged: 1 }],
};

const sandboxFrom = (pathDirs: readonly string[]): SandboxConfig => ({
  commands: committed.fix.sandbox.commands.map((command) => [...command]),
  timeoutMs: 120_000,
  pathDirs,
});

describe('the committed sandbox check commands', () => {
  test('the config ships checks, so no fix can publish without one', () => {
    expect(committed.fix.sandbox.commands.length).toBeGreaterThan(0);
    expect(committed.fix.sandbox.pathDirs.length).toBeGreaterThan(0);
    // The file names the runtime directory it expects; the owner sets it per deployment.
    expect(committed.fix.sandbox.pathDirs.every((dir) => dir.startsWith('/'))).toBe(true);
  });

  test('the committed PATH directories are absolute and hold no unexpanded path', async () => {
    const yaml = await readFile(fileURLToPath(DEFAULT_CONFIG_PATH), 'utf8');
    for (const dir of committed.fix.sandbox.pathDirs) {
      expect(dir.startsWith('/')).toBe(true);
      // The sandbox builds its own environment and never expands one, so an
      // unexpanded tilde or variable in the file would silently block every fix.
      expect(dir).not.toContain('~');
      expect(dir).not.toContain('$');
    }
    // At least one committed directory is a real directory the check can run from.
    expect(committed.fix.sandbox.pathDirs.some((dir) => existsSync(dir))).toBe(true);
    // The config comment and the security note both keep telling a Linux owner whose
    // runtime is a per-user install to write that directory out in full.
    expect(yaml).toContain('pathDirs');
    expect(yaml).toContain('The host PATH is never inherited');
    expect(yaml).toContain('$HOME/.bun/bin');
    const security = await readFile(join(repoRoot, 'docs', 'SECURITY.md'), 'utf8');
    expect(security).toContain('~/.bun/bin');
    expect(security).toContain('fix.sandbox.pathDirs');
  });

  test(
    'the check runtime resolves through the committed sandbox PATH, never the host PATH',
    async () => {
      const dirs = runtimeDirsForHost();
      const env = sandboxEnv('/tmp', dirs);
      const pathValue = env.PATH ?? '';
      // The owner-set directories are what supply the runtime: the system
      // directories alone do not contain it, and the child sees only what
      // Graveshift built.
      expect(pathValue.startsWith('/usr/bin:/bin:')).toBe(true);
      expect(Bun.which('bun', { PATH: '/usr/bin:/bin' })).toBeNull();
      const found = Bun.which('bun', { PATH: pathValue });
      expect(found).not.toBeNull();
      expect(dirs.some((dir) => found!.startsWith(`${dir}/`))).toBe(true);
      // Starting it by bare name is what a committed command does, so this is the
      // real path a fix takes: no absolute program, no host PATH.
      const started = await runner({
        argv: ['bun', '--version'],
        cwd: '/tmp',
        env,
        timeoutMs: 30_000,
      });
      expect(started.exitCode).toBe(0);
      expect(started.stdout.trim()).toBe(Bun.version);
      // Every program the committed commands name starts the same way.
      const programs = committed.fix.sandbox.commands.flatMap((command) =>
        command[0] === undefined ? [] : [command[0]],
      );
      const startedPrograms = await Promise.all(
        [...new Set(programs)].map((program) =>
          runner({ argv: [program, '--version'], cwd: '/tmp', env, timeoutMs: 30_000 }),
        ),
      );
      for (const check of startedPrograms) {
        expect(check.exitCode).toBe(0);
        expect(check.timedOut).toBe(false);
      }
    },
    REAL_SUBPROCESS_TIMEOUT_MS,
  );

  test(
    'every committed command starts and passes in the sandbox',
    async () => {
      const workspace = createSandboxWorkspace({ runner });
      const result = await workspace.verify(project(), patched, sandboxFrom([bunDir]));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.checks).toHaveLength(committed.fix.sandbox.commands.length);
      for (const check of result.checks) {
        expect(check.exitCode).toBe(0);
        expect(check.timedOut).toBe(false);
      }
      expect(result.checks.map((check) => check.command.join(' ')).join('\n')).toContain('bun');
    },
    REAL_SUBPROCESS_TIMEOUT_MS,
  );

  test(
    'the committed commands block the fix when PATH has no runtime directory',
    async () => {
      const workspace = createSandboxWorkspace({ runner });
      const result = await workspace.verify(project(), patched, sandboxFrom([]));
      // Fail closed: the command cannot start, so it never reports success and no
      // pull request follows. Under a jail the jail itself reports the failure.
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.checks[0]!.exitCode).not.toBe(0);
      expect(result.reason).not.toBe('');
    },
    REAL_SUBPROCESS_TIMEOUT_MS,
  );
});
