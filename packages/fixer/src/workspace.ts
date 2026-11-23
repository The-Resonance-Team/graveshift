import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
  chmod,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

import type { Patch } from '@graveshift/patch/schemas';

import { FixerFault } from './faults';
import { safeSourcePath, type SourceSnapshot } from './source';

export async function createWorkspace(): Promise<string> {
  const parent = join(tmpdir(), 'opencode');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(await realpath(parent), 'fixer-'));
  await Promise.all(['work', 'home', 'tmp', 'template'].map((name) => mkdir(join(root, name))));
  return root;
}

async function safeTarget(cwd: string, path: string): Promise<string> {
  if (!(await lstat(cwd)).isDirectory() || (await realpath(cwd)) !== cwd) {
    throw new FixerFault('CHECK_FAILED', 'workspace root is not an isolated directory');
  }
  if (!safeSourcePath(path)) throw new FixerFault('CHECK_FAILED', 'unsafe workspace path');
  const target = resolve(cwd, path);
  const local = relative(cwd, target);
  if (local.startsWith(`..${sep}`) || local === '..' || local === '') {
    throw new FixerFault('CHECK_FAILED', 'workspace path escapes its root');
  }
  const parts = local.split(sep);
  await Promise.all(
    parts.map(async (_part, index) => {
      const current = join(cwd, ...parts.slice(0, index + 1));
      try {
        if ((await lstat(current)).isSymbolicLink()) {
          throw new FixerFault('CHECK_FAILED', 'workspace contains a symlink');
        }
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
        throw error;
      }
    }),
  );
  return target;
}

export async function writeSource(cwd: string, snapshot: SourceSnapshot): Promise<void> {
  await Promise.all(
    snapshot.files.map(async (file) => {
      const target = await safeTarget(cwd, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, { flag: 'wx' });
      await chmod(target, file.mode === '100755' ? 0o700 : 0o600);
    }),
  );
}

export async function applyPatch(cwd: string, patch: Patch): Promise<void> {
  // Check the complete candidate before any file is replaced or removed.
  const targets = await Promise.all(patch.files.map((file) => safeTarget(cwd, file.path)));
  await Promise.all(
    patch.files.map(async (file, index) => {
      const target = targets[index];
      if (target === undefined) throw new FixerFault('CHECK_FAILED', 'missing workspace target');
      if (file.content === null) await rm(target);
      else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.content);
      }
    }),
  );
}

export async function assertWorkspace(
  cwd: string,
  snapshot: SourceSnapshot,
  patch: Patch,
): Promise<void> {
  if (!(await lstat(cwd)).isDirectory() || (await realpath(cwd)) !== cwd) {
    throw new FixerFault('CHECK_FAILED', 'workspace root is not an isolated directory');
  }
  const expected = new Map(
    snapshot.files.map((file) => [
      file.path,
      {
        content: file.content,
        executable: file.mode === '100755',
      },
    ]),
  );
  for (const file of patch.files) {
    if (file.content === null) expected.delete(file.path);
    else
      expected.set(file.path, {
        content: file.content,
        executable: snapshot.files.some(
          (base) => base.path === file.path && base.mode === '100755',
        ),
      });
  }
  const found = new Set<string>();
  async function walk(folder: string): Promise<void> {
    await Promise.all(
      (await readdir(folder, { withFileTypes: true })).map(async (entry) => {
        const target = join(folder, entry.name);
        const path = relative(cwd, target).split(sep).join('/');
        if (entry.isSymbolicLink()) throw new FixerFault('CHECK_FAILED', 'check created a symlink');
        if (folder === cwd && entry.name === '.git') return;
        if (entry.isDirectory()) {
          if (
            ![...snapshot.files, ...patch.files].some((file) => file.path.startsWith(`${path}/`))
          ) {
            throw new FixerFault('CHECK_FAILED', 'check added an unexpected directory');
          }
          await walk(target);
          return;
        }
        const file = expected.get(path);
        const info = await lstat(target);
        if (
          !entry.isFile() ||
          !file ||
          info.size !== Buffer.byteLength(file.content) ||
          ((info.mode & 0o111) !== 0) !== file.executable ||
          (await readFile(target, 'utf8')) !== file.content
        ) {
          throw new FixerFault('CHECK_FAILED', 'check modified the proposed source');
        } else found.add(path);
      }),
    );
  }
  await walk(cwd);
  if (found.size !== expected.size)
    throw new FixerFault('CHECK_FAILED', 'check removed source files');
}
