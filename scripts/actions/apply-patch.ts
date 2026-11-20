import { realpathSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import { redact } from '@graveshift/redactor';

import {
  assertBaseRef,
  assertBranchSlug,
  assertNoSymlinkEscape,
  assertParentInside,
  evaluatePolicyAllow,
  fail,
  loadOneShotPolicy,
  validatePatch,
} from './one-shot';

const git = async (args: readonly string[], env: Record<string, string>): Promise<void> => {
  const child = Bun.spawn(['git', ...args], {
    cwd: process.cwd(),
    env,
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
  assertBaseRef(process.env.BASE_REF);
  const token = process.env.PR_TOKEN;
  if (!token) throw new Error('pr_token is missing');
  const { policy, rules } = await loadOneShotPolicy();
  evaluatePolicyAllow(process.env.POLICY_DECISION, policy);
  const patch = validatePatch(await Bun.file('patch.json').text(), rules);

  const encoded = Buffer.from(`x-access-token:${token}`).toString('base64');
  process.stdout.write(`::add-mask::${encoded}\n`);
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Graveshift',
    GIT_AUTHOR_EMAIL: 'graveshift@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'Graveshift',
    GIT_COMMITTER_EMAIL: 'graveshift@users.noreply.github.com',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${encoded}`,
  };

  const rootReal = realpathSync(process.cwd());
  const writes: Promise<number>[] = [];
  for (const file of patch.files) {
    const target = resolve(rootReal, file.path);
    assertNoSymlinkEscape(rootReal, target);
    if (file.content === null) {
      rmSync(target, { force: true });
      continue;
    }
    assertParentInside(rootReal, target);
    writes.push(Bun.write(target, file.content));
  }
  await Promise.all(writes);
  rmSync('patch.json', { force: true });

  await git(['checkout', '-B', slug], env);
  await git(['add', '-A'], env);
  await git(['commit', '-m', 'graveshift: apply generated patch'], env);
  await git(['push', '-u', 'origin', slug], env);
} catch (error) {
  fail(error);
}
