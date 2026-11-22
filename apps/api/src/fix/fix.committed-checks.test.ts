// The committed graveshift.config.yaml ships the check commands every fix must
// pass before a pull request opens. These tests run those exact commands
// through the real sandbox: they must start on the owner's runtime, and a
// missing PATH entry must block the fix instead of failing open.
import { dirname } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { loadGraveshiftConfig } from '@graveshift/config';
import {
  createSandboxWorkspace,
  createSpawnRunner,
  jailWorks,
  networkJail,
  type CommandRunner,
  type SandboxConfig,
} from '@graveshift/fixer';

const committed = await loadGraveshiftConfig();

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

  test('every committed command starts and passes in the sandbox', async () => {
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
  });

  test('the committed commands block the fix when PATH has no runtime directory', async () => {
    const workspace = createSandboxWorkspace({ runner });
    const result = await workspace.verify(project(), patched, sandboxFrom([]));
    // Fail closed: the command cannot start, so it never reports success and no
    // pull request follows. Under a jail the jail itself reports the failure.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.checks[0]!.exitCode).not.toBe(0);
    expect(result.reason).not.toBe('');
  });
});
