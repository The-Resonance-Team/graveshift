import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { GraveshiftError } from '@graveshift/core';

import { unsafePath } from './guard';
import type { BaseSnapshot, SourceFile } from './source';
import type { Patch, PatchFile } from './types';

export class SandboxUnavailableError extends GraveshiftError<'SANDBOX_UNAVAILABLE'> {
  constructor(message: string) {
    super('SANDBOX_UNAVAILABLE', message);
  }
}

// Check commands come from the committed config file, never from the model or
// the repository. The owner sets them per deployment.
export interface SandboxConfig {
  readonly commands: readonly (readonly string[])[];
  readonly timeoutMs: number;
}

export interface CheckOutcome {
  readonly command: readonly string[];
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export type VerifyResult =
  | { ok: true; checks: readonly CheckOutcome[] }
  | { ok: false; reason: string; checks: readonly CheckOutcome[] };

export interface SpawnRequest {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

export interface SpawnOutcome {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export type CommandRunner = (request: SpawnRequest) => Promise<SpawnOutcome>;

/** The injectable workspace seam. Production uses createSandboxWorkspace. */
export interface FixWorkspace {
  /** Checkout base, apply the verified patch, then run every check command. */
  verify(base: BaseSnapshot, patch: Patch, sandbox: SandboxConfig): Promise<VerifyResult>;
}

const OUTPUT_CAP = 64_000;
const SANDBOX_EXEC_PROFILE = '(version 1)(allow default)(deny network*)';

const firstExisting = (paths: readonly string[]): string | undefined =>
  paths.find((candidate) => existsSync(candidate));

/**
 * The per-platform command prefix that blocks network access for a check
 * process. Null means this platform has no jail binary: the workspace then
 * fails closed instead of running checks with network. Linux asks for a user
 * namespace too (`-r`), so an unprivileged host needs no extra capability.
 */
export function networkJail(
  platform: NodeJS.Platform = process.platform,
): readonly string[] | null {
  if (platform === 'darwin') {
    const jail = firstExisting(['/usr/bin/sandbox-exec']);
    return jail === undefined ? null : [jail, '-p', SANDBOX_EXEC_PROFILE];
  }
  if (platform === 'linux') {
    const jail = firstExisting(['/usr/bin/unshare', '/bin/unshare']);
    return jail === undefined ? null : [jail, '-rn', '--'];
  }
  return null;
}

/**
 * True when the given jail prefix can start a process here. A host can have the
 * binary and still refuse the namespace, so a jail is proven, not assumed. The
 * probe inherits no environment, so no secret reaches it.
 */
export async function jailWorks(jail: readonly string[] | null = networkJail()): Promise<boolean> {
  if (jail === null) return false;
  const probe = Bun.spawn([...jail, '/usr/bin/true'], {
    env: {},
    stdout: 'ignore',
    stderr: 'ignore',
  });
  return (await probe.exited) === 0;
}

/**
 * The exact environment a check command may see: no inherited variables, so
 * no model key, GitHub App key or any other secret ever reaches the process.
 */
export function sandboxEnv(homeDir: string): Record<string, string> {
  return { PATH: '/usr/bin:/bin', HOME: homeDir };
}

/**
 * Run a check command under a jail.
 *
 * - No argument is the production shape: the platform jail is used and proven
 *   by a probe, and a jail that is missing or cannot start blocks every fix.
 * - An explicit jail (or null) is a caller choice and is used exactly as given,
 *   so a test pins the argv it expects.
 * - `requireJail` is true by default: without a jail the run then fails closed.
 *   Only a caller that accepts checks without the jail — the committed tests on
 *   a host that blocks user namespaces — passes `requireJail: false`.
 */
export function createSpawnRunner(
  jail?: readonly string[] | null,
  options: { requireJail?: boolean } = {},
): CommandRunner {
  const requireJail = options.requireJail ?? true;
  const explicit = jail !== undefined;
  return async (request) => {
    let chosen = explicit ? (jail ?? null) : networkJail();
    if (chosen !== null && !explicit && !(await jailWorks(chosen))) {
      if (requireJail) {
        throw new SandboxUnavailableError(`the jail cannot start on ${process.platform}`);
      }
      chosen = null;
    }
    if (chosen === null && requireJail) {
      throw new SandboxUnavailableError(`no jail is available on ${process.platform}`);
    }
    const child = Bun.spawn([...(chosen ?? []), ...request.argv], {
      cwd: request.cwd,
      env: { ...request.env },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, request.timeoutMs);
    const exitCode = await child.exited;
    clearTimeout(timer);
    const stdout = await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    return {
      exitCode: timedOut ? null : exitCode,
      timedOut,
      stdout: stdout.slice(-OUTPUT_CAP),
      stderr: stderr.slice(-OUTPUT_CAP),
    };
  };
}

export interface SandboxWorkspaceOptions {
  /** Injected for tests; production spawns through createSpawnRunner. */
  runner?: CommandRunner;
  /** Injected for tests; production uses the network-jail runner. */
  createRunner?: () => CommandRunner;
}

// The sandbox never fails open: a missing jail, a failed check or a timeout
// blocks the pull request. The temp directory is removed after every run.
export function createSandboxWorkspace(options: SandboxWorkspaceOptions = {}): FixWorkspace {
  const runner = options.runner ?? (options.createRunner ?? createSpawnRunner)();
  return {
    async verify(base, patch, sandbox) {
      if (sandbox.commands.length === 0) {
        return { ok: false, reason: 'no_check_commands_configured', checks: [] };
      }
      const dir = await mkdtemp(join(tmpdir(), 'graveshift-sandbox-'));
      const checks: CheckOutcome[] = [];
      try {
        for (const file of base.files) {
          if (unsafePath(file.path))
            return { ok: false, reason: `unsafe base path ${file.path}`, checks };
        }
        for (const file of patch.files) {
          if (unsafePath(file.path))
            return { ok: false, reason: `unsafe patch path ${file.path}`, checks };
        }
        const checkout = async (file: SourceFile): Promise<void> => {
          await mkdir(join(dir, dirname(file.path)), { recursive: true });
          await writeFile(join(dir, file.path), file.bytes);
        };
        const write = async (file: PatchFile): Promise<void> => {
          if (file.content === null) {
            await rm(join(dir, file.path), { force: true });
            return;
          }
          await mkdir(join(dir, dirname(file.path)), { recursive: true });
          await writeFile(join(dir, file.path), file.content, 'utf8');
        };
        // Checkout and patch writes are independent per path, so they batch.
        await Promise.all(base.files.map((file) => checkout(file)));
        await Promise.all(patch.files.map((file) => write(file)));
        // Checks run one after another: the first failure or timeout stops the run.
        const runFrom = async (index: number): Promise<VerifyResult> => {
          if (index >= sandbox.commands.length) return { ok: true, checks };
          const command = sandbox.commands[index]!;
          let outcome: SpawnOutcome;
          try {
            outcome = await runner({
              argv: [...command],
              cwd: dir,
              env: sandboxEnv(dir),
              timeoutMs: sandbox.timeoutMs,
            });
          } catch (error) {
            const reason = error instanceof Error ? error.message : 'check runner failed';
            return { ok: false, reason, checks };
          }
          const check: CheckOutcome = { command: [...command], ...outcome };
          checks.push(check);
          if (check.timedOut || check.exitCode !== 0) {
            return {
              ok: false,
              reason: check.timedOut
                ? `check timed out after ${sandbox.timeoutMs}ms: ${command.join(' ')}`
                : `check failed with exit ${check.exitCode}: ${command.join(' ')}`,
              checks,
            };
          }
          return runFrom(index + 1);
        };
        return await runFrom(0);
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  };
}
