import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { redact } from '@graveshift/redactor';

import { unsafePath } from './guard';
import { createSpawnRunner, sandboxEnv, type CommandRunner, type SpawnOutcome } from './spawn';
import type { BaseSnapshot, SourceFile } from './source';
import type { Patch, PatchFile } from './types';

/**
 * Check commands come from the committed config file, never from the model or
 * the repository. The owner sets them per deployment.
 */
export interface SandboxConfig {
  readonly commands: readonly (readonly string[])[];
  readonly timeoutMs: number;
  /**
   * Owner-set absolute directories appended to the sandbox `PATH` after
   * `/usr/bin:/bin`, such as the directory that holds `bun`. There is no
   * implicit host `PATH`: a command whose program lives outside these
   * directories cannot start, so the checks fail and no pull request opens.
   */
  readonly pathDirs?: readonly string[];
}

/** One recorded check. Output is capped and redacted at capture. */
export interface CheckOutcome {
  readonly command: readonly string[];
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
}

export type VerifyResult =
  | { ok: true; checks: readonly CheckOutcome[] }
  | { ok: false; reason: string; checks: readonly CheckOutcome[] };

/** The injectable workspace seam. Production uses createSandboxWorkspace. */
export interface FixWorkspace {
  /** Checkout base, apply the verified patch, then run every check command. */
  verify(base: BaseSnapshot, patch: Patch, sandbox: SandboxConfig): Promise<VerifyResult>;
}

export interface SandboxWorkspaceOptions {
  /** Injected for tests; production spawns through createSpawnRunner. */
  runner?: CommandRunner;
  /** Injected for tests; production uses the network-jail runner. */
  createRunner?: () => CommandRunner;
}

/** One check: the runner outcome, with output redacted and the command recorded. */
const checkOf = (command: readonly string[], outcome: SpawnOutcome): CheckOutcome => ({
  command: [...command],
  ...outcome,
  stdout: redact(outcome.stdout),
  stderr: redact(outcome.stderr),
});

/** The check recorded when the command could not start at all. */
const notRunCheck = (command: readonly string[], reason: string): CheckOutcome => ({
  command: [...command],
  exitCode: null,
  timedOut: false,
  stdout: '',
  stderr: `check runner failed: ${reason}`,
  stdoutTruncated: false,
  stderrTruncated: false,
});

const failureReason = (command: readonly string[], check: CheckOutcome, timeoutMs: number) =>
  check.timedOut
    ? `check timed out after ${timeoutMs}ms: ${command.join(' ')}`
    : `check failed with exit ${check.exitCode}: ${command.join(' ')}`;

// The sandbox never fails open: a missing jail, a failed check, a timeout or a
// command that cannot start blocks the pull request, and every one of them is
// recorded. The temp directory is removed after every run.
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
              env: sandboxEnv(dir, sandbox.pathDirs ?? []),
              timeoutMs: sandbox.timeoutMs,
            });
          } catch (error) {
            const reason = redact(error instanceof Error ? error.message : 'check runner failed');
            checks.push(notRunCheck(command, reason));
            return { ok: false, reason, checks };
          }
          const check = checkOf(command, outcome);
          checks.push(check);
          if (check.timedOut || check.exitCode !== 0) {
            return { ok: false, reason: failureReason(command, check, sandbox.timeoutMs), checks };
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
