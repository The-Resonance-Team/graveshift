import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { guardPatch, PatchRejectedError } from '@graveshift/patch/guard';
import { PatchSchema, type Patch } from '@graveshift/patch/schemas';

import { FixerFault } from './faults';
import { runSandboxed, sandboxEnv, type SandboxRunner } from './sandbox';
import {
  assertPatchBase,
  sourceHash,
  validatePatchTargets,
  validateSnapshot,
  type SourceSnapshot,
} from './source';
import { applyPatch, assertWorkspace, createWorkspace, writeSource } from './workspace';

export interface VerificationConfig {
  readonly commands: readonly (readonly string[])[];
  readonly timeoutMs: number;
}

export interface CheckResult {
  readonly command: readonly string[];
  readonly exitCode: 0;
  readonly durationMs: number;
}

export interface FileChange {
  readonly path: string;
  readonly added: number;
  readonly deleted: number;
}

export interface VerifiedPatch {
  readonly patch: Patch;
  readonly snapshotHash: string;
  readonly patchHash: string;
  readonly diff: string;
  readonly changes: readonly FileChange[];
  readonly checks: readonly CheckResult[];
}

export interface VerifyPatchInput extends VerificationConfig {
  snapshot: SourceSnapshot;
  patch: Patch;
  runner?: SandboxRunner;
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const receipts = new WeakMap<VerifiedPatch, string>();

export function assertVerified(snapshot: SourceSnapshot, verified: VerifiedPatch): void {
  validateSnapshot(snapshot);
  guardPatch(verified.patch, snapshot.rules);
  assertPatchBase(snapshot, verified.patch);
  if (
    receipts.get(verified) !== hash(verified) ||
    verified.snapshotHash !== sourceHash(snapshot) ||
    verified.patchHash !== hash(verified.patch)
  ) {
    throw new FixerFault('CHECK_FAILED', 'verification does not match this source and patch');
  }
}

function parseChanges(text: string): FileChange[] {
  return text
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const first = line.indexOf('\t');
      const second = line.indexOf('\t', first + 1);
      const added = Number(line.slice(0, first));
      const deleted = Number(line.slice(first + 1, second));
      if (
        first < 1 ||
        second < 0 ||
        !Number.isInteger(added) ||
        !Number.isInteger(deleted) ||
        added < 0 ||
        deleted < 0
      ) {
        throw new FixerFault('CHECK_FAILED', 'diff statistics are invalid');
      }
      return { path: line.slice(second + 1), added, deleted };
    });
}

function checkConfig(input: VerificationConfig): void {
  if (
    !Number.isInteger(input.timeoutMs) ||
    input.timeoutMs < 1 ||
    input.timeoutMs > 120_000 ||
    input.commands.length === 0 ||
    input.commands.length > 20 ||
    input.commands.some(
      (command) =>
        command.length === 0 ||
        command[0] === '' ||
        command.length > 100 ||
        command.some((argument) => argument.includes('\0')),
    )
  ) {
    throw new FixerFault(
      'CHECK_FAILED',
      'verification needs configured argv commands and a bounded timeout',
    );
  }
}

export async function verifyPatch(input: VerifyPatchInput): Promise<VerifiedPatch> {
  checkConfig(input);
  const snapshot = structuredClone(input.snapshot);
  validateSnapshot(snapshot);
  const patch = PatchSchema.parse(input.patch);
  guardPatch(patch, snapshot.rules);
  assertPatchBase(snapshot, patch);
  validatePatchTargets(snapshot, patch);

  const root = await createWorkspace();
  const cwd = join(root, 'work');
  const env = sandboxEnv(root);
  const deadline = performance.now() + input.timeoutMs;
  const runner = input.runner ?? runSandboxed;
  async function run(argv: readonly string[]) {
    const remaining = Math.floor(deadline - performance.now());
    if (remaining <= 0) throw new FixerFault('CHECK_FAILED', 'verification timed out');
    const result = await runner({ argv, cwd, root, env, timeoutMs: remaining, noNetwork: true });
    if (result.exitCode !== 0 || result.timedOut) {
      throw new FixerFault(
        'CHECK_FAILED',
        result.timedOut ? 'verification timed out' : 'verification command failed',
      );
    }
    return result.stdout;
  }
  try {
    await writeSource(cwd, snapshot);
    await run(['git', 'init', '--quiet', '--template', join(root, 'template')]);
    await run(['git', 'add', '--all']);
    await run([
      'git',
      '-c',
      'user.name=Graveshift',
      '-c',
      'user.email=fixer@localhost',
      '-c',
      'commit.gpgSign=false',
      'commit',
      '--quiet',
      '--no-verify',
      '-m',
      'Verification base',
    ]);
    await applyPatch(cwd, patch);
    const newPaths = patch.files.filter(
      (file) => file.content !== null && !snapshot.files.some((base) => base.path === file.path),
    );
    if (newPaths.length > 0)
      await run(['git', 'add', '--intent-to-add', '--', ...newPaths.map((file) => file.path)]);
    const changes = parseChanges(
      await run([
        'git',
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--no-renames',
        '--numstat',
        '-z',
        'HEAD',
        '--',
      ]),
    );
    if (
      changes.length === 0 ||
      changes.length !== patch.files.length ||
      patch.files.some((file) => !changes.some((change) => change.path === file.path))
    ) {
      throw new FixerFault('CHECK_FAILED', 'patch contains unchanged or unverified files');
    }
    const actual: Patch = {
      baseSha: patch.baseSha,
      files: patch.files.map((file) => {
        const change = changes.find((entry) => entry.path === file.path);
        if (!change) throw new FixerFault('CHECK_FAILED', 'patch is missing its actual diff');
        return { ...file, linesChanged: change.added + change.deleted };
      }),
    };
    guardPatch(actual, snapshot.rules);
    const diff = await run([
      'git',
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      'HEAD',
      '--',
    ]);
    const checks = await input.commands.reduce<Promise<CheckResult[]>>(
      async (previous, command) => {
        const completed = await previous;
        const start = performance.now();
        await run(command);
        completed.push({
          command: [...command],
          exitCode: 0,
          durationMs: Math.round(performance.now() - start),
        });
        await assertWorkspace(cwd, snapshot, actual);
        return completed;
      },
      Promise.resolve([]),
    );
    const verified = {
      patch: actual,
      snapshotHash: sourceHash(snapshot),
      patchHash: hash(actual),
      diff,
      changes,
      checks,
    };
    receipts.set(verified, hash(verified));
    return verified;
  } catch (error) {
    if (error instanceof FixerFault || error instanceof PatchRejectedError) throw error;
    throw new FixerFault('CHECK_FAILED', 'patch verification could not complete');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
