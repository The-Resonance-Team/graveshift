import { existsSync } from 'node:fs';

import { GraveshiftError } from '@graveshift/core';

import { after, readCapped } from './pipes';

export class SandboxUnavailableError extends GraveshiftError<'SANDBOX_UNAVAILABLE'> {
  constructor(message: string) {
    super('SANDBOX_UNAVAILABLE', message);
  }
}

/** The system directories every check may look in. Nothing else is inherited. */
export const SANDBOX_SYSTEM_PATH_DIRS = ['/usr/bin', '/bin'] as const;

/**
 * Names a check command may take from the host environment. They carry no
 * credential by convention, and a command still sees no variable that is not
 * listed here, so no model key, GitHub App key or token reaches the process.
 * `PATH` and `HOME` are always built by Graveshift, never copied.
 */
export const SANDBOX_ENV_ALLOWLIST = [
  'LANG',
  'LC_ALL',
  'TZ',
  'NODE_ENV',
  'BUN_ENV',
  'FORCE_COLOR',
  'NO_COLOR',
] as const;

const SAFE_ENV_VALUE = /^[\x20-\x7e]*$/;

// stdout and stderr stay under this limit; see readCapped.
export const SANDBOX_OUTPUT_CAP = 64 * 1_024;

/** Bounded wait for the pipes after the command is gone; then they are cancelled. */
export const PIPE_DRAIN_MS = 500;

const SANDBOX_EXEC_PROFILE = '(version 1)(allow default)(deny network*)';

const firstExisting = (paths: readonly string[]): string | undefined =>
  paths.find((candidate) => existsSync(candidate));

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
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
}

export type CommandRunner = (request: SpawnRequest) => Promise<SpawnOutcome>;

/** The part of a started check the runner touches, kept small so a test can drive it. */
export interface SpawnedChild {
  readonly pid: number;
  /** Null until the process is gone; the runner only signals a process that is ours. */
  readonly exitCode: number | null;
  readonly exited: Promise<number>;
  readonly stdout: ReadableStream<Uint8Array> | null;
  readonly stderr: ReadableStream<Uint8Array> | null;
}

export interface SpawnInit {
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly stdout: 'pipe';
  readonly stderr: 'pipe';
}

export type SpawnChild = (argv: readonly string[], init: SpawnInit) => SpawnedChild;

const spawnBunChild: SpawnChild = (argv, init) => Bun.spawn([...argv], init);

/**
 * The per-platform command prefix that blocks network access for a check
 * process. Null means this platform has no jail binary: the workspace then
 * fails closed instead of running checks with network. Linux asks for a user
 * namespace too (`-r`), so an unprivileged host needs no extra capability.
 *
 * Documented limit: the jail blocks network only. It does not confine file
 * access — see ADR 0016 and docs/SECURITY.md.
 */
export function networkJail(
  platform: NodeJS.Platform = process.platform,
): readonly string[] | null {
  if (platform === 'darwin') {
    const jail = firstExisting(['/usr/bin/sandbox-exec']);
    return jail === undefined ? null : [jail, '-p', SANDBOX_EXEC_PROFILE];
  }
  if (platform === 'linux') {
    // `--` ends unshare's options: check commands are data, never unshare flags.
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
 * The exact environment a check command may see. `PATH` is the system
 * directories plus the owner-set runtime directories from the config file: the
 * host `PATH` is never inherited, and neither is any other host variable outside
 * the allowlist, so no model key, GitHub App key or secret reaches the process.
 */
export function sandboxEnv(
  homeDir: string,
  pathDirs: readonly string[] = [],
): Record<string, string> {
  const dirs = new Set<string>(SANDBOX_SYSTEM_PATH_DIRS);
  for (const dir of pathDirs) {
    const trimmed = dir.trim();
    if (trimmed !== '') dirs.add(trimmed);
  }
  const env: Record<string, string> = { PATH: [...dirs].join(':'), HOME: homeDir };
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined || name === 'PATH' || name === 'HOME') continue;
    if (!(SANDBOX_ENV_ALLOWLIST as readonly string[]).includes(name)) continue;
    if (!SAFE_ENV_VALUE.test(value)) continue;
    env[name] = value;
  }
  return env;
}

/**
 * Signal the whole process group when the command is one, then the process
 * itself. The timeout timer is the only caller, and only while the command has
 * not reported an exit code, so the pid is still ours. Where the jail gave the
 * command its own group this takes the grandchildren with it; where it did not,
 * the bounded pipe drain and the reader cancel in the runner keep a surviving
 * grandchild from holding the run open.
 */
function killProcessTree(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* the command leads a group only under some jails; try the process */
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* the process already exited */
  }
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
 * - `spawn` is the process seam. Production starts through Bun; a test injects a
 *   child so it can drive the pipes and the kill path directly.
 */
export function createSpawnRunner(
  jail?: readonly string[] | null,
  options: { requireJail?: boolean; spawn?: SpawnChild } = {},
): CommandRunner {
  const requireJail = options.requireJail ?? true;
  const spawn = options.spawn ?? spawnBunChild;
  const explicit = jail !== undefined;
  return async (request) => {
    const chosen = await chosenJail(explicit, jail ?? null, requireJail);
    const child = spawn([...(chosen ?? []), ...request.argv], {
      cwd: request.cwd,
      env: { ...request.env },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    let timedOut = false;
    // The only place a signal is sent. The guard is the point: while the command is
    // still running the pid is ours, and once it exited the pid can be reused by
    // the system, so a signal there could hit an unrelated process.
    const timer = setTimeout(() => {
      if (child.exitCode !== null) return;
      timedOut = true;
      killProcessTree(child.pid);
    }, request.timeoutMs);
    // The pipes are read while the command runs, never after it.
    const stdout = readCapped(child.stdout, SANDBOX_OUTPUT_CAP);
    const stderr = readCapped(child.stderr, SANDBOX_OUTPUT_CAP);
    const exitCode = await child.exited;
    clearTimeout(timer);
    const drained = await Promise.race([
      Promise.all([stdout.done, stderr.done]),
      after(PIPE_DRAIN_MS),
    ]);
    if (drained === 'expired') {
      // A grandchild that inherited the pipes and outlived the direct child is no
      // longer signalled (its parent's pid is gone); the readers are cancelled
      // instead, so nothing waits on it and no read stays parked on the pipe.
      stdout.cancel();
      stderr.cancel();
    }
    return {
      exitCode: timedOut ? null : exitCode,
      timedOut,
      stdout: stdout.result.text,
      stderr: stderr.result.text,
      stdoutTruncated: stdout.result.truncated,
      stderrTruncated: stderr.result.truncated,
    };
  };
}

/** The jail to use, proven by a probe in the production shape. */
async function chosenJail(
  explicit: boolean,
  jail: readonly string[] | null,
  requireJail: boolean,
): Promise<readonly string[] | null> {
  if (explicit) {
    if (jail === null && requireJail) {
      throw new SandboxUnavailableError(`no jail is available on ${process.platform}`);
    }
    return jail;
  }
  const found = networkJail();
  if (found === null) {
    if (requireJail)
      throw new SandboxUnavailableError(`no jail is available on ${process.platform}`);
    return null;
  }
  if (await jailWorks(found)) return found;
  if (requireJail)
    throw new SandboxUnavailableError(`the jail cannot start on ${process.platform}`);
  return null;
}
