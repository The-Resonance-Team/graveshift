import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

import { redact } from '@graveshift/redactor';

import { assertBranchSlug, fail, repoRules, validatePatch } from './one-shot';

const git = async (args: readonly string[]): Promise<void> => {
  const child = Bun.spawn(['git', ...args], {
    cwd: process.cwd(),
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    stdout: 'ignore',
    stderr: 'pipe',
  });
  const code = await child.exited;
  if (code !== 0) {
    const error = await new Response(child.stderr).text();
    throw new Error(`git ${args[0] ?? ''} failed: ${redact(error)}`);
  }
};

try {
  // Validate before any workspace write, commit or push.
  const slug = assertBranchSlug(process.env.BRANCH_SLUG);
  const token = process.env.PR_TOKEN;
  if (!token) throw new Error('pr_token is missing');
  const rules = await repoRules();
  const patch = validatePatch(await Bun.file('patch.json').text(), rules);

  const root = process.cwd();
  const writes: Promise<number>[] = [];
  for (const file of patch.files) {
    const target = resolve(root, file.path);
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      throw new Error('patch path escapes the workspace');
    }
    if (file.content === null) {
      rmSync(target, { force: true });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writes.push(Bun.write(target, file.content));
  }
  await Promise.all(writes);
  rmSync('patch.json', { force: true });

  await git(['checkout', '-B', slug]);
  await git(['add', '-A']);
  await git(['commit', '-m', 'graveshift: apply generated patch']);
  const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  await git(['-c', `http.https://github.com/.extraheader=${header}`, 'push', '-u', 'origin', slug]);
} catch (error) {
  fail(error);
}
