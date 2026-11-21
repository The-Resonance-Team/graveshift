import { realpathSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import { redact } from '@graveshift/redactor';

import {
  assertBaseRef,
  assertBranchSlug,
  assertNoSymlinkEscape,
  assertParentInside,
  assertPayloadSize,
  evaluateSignedPolicyAllow,
  fail,
  loadOneShotPolicy,
  redactPatch,
  validatePatch,
} from './one-shot';

const git = async (args: readonly string[], env: Record<string, string>): Promise<string> => {
  const child = Bun.spawn(['git', ...args], {
    cwd: resolve(process.cwd(), process.env.PATCH_WORKSPACE ?? '.'),
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const code = await child.exited;
  const output = await new Response(child.stdout).text();
  if (code !== 0) {
    const error = await new Response(child.stderr).text();
    throw new Error(`git ${args[0] ?? ''} failed: ${redact(error)}`);
  }
  return output.trim();
};

try {
  // Validate before any workspace write, commit or push.
  const slug = assertBranchSlug(process.env.BRANCH_SLUG);
  assertBaseRef(process.env.BASE_REF);
  if (!process.env.WORK_ITEM_ID) throw new Error('work_item_id is missing');
  const token = process.env.PR_TOKEN;
  if (!token) throw new Error('pr_token is missing');
  const payload = assertPayloadSize(process.env.PATCH_PAYLOAD);
  const { policy, rules } = await loadOneShotPolicy();
  evaluateSignedPolicyAllow(
    process.env.POLICY_DECISION,
    process.env.POLICY_SIGNATURE,
    process.env.POLICY_SIGNING_KEY,
    {
      repository: process.env.GITHUB_REPOSITORY ?? '',
      workItemId: process.env.WORK_ITEM_ID ?? '',
      incidentRef: process.env.INCIDENT_REF ?? '',
      branchSlug: process.env.BRANCH_SLUG ?? '',
      baseRef: process.env.BASE_REF ?? '',
      baseSha: process.env.BASE_SHA ?? '',
      prTitle: process.env.PR_TITLE ?? '',
      patchPayload: payload,
    },
    policy,
  );
  const patch = validatePatch(await Bun.file('patch.json').text(), rules);
  const expectedPatch = redactPatch(validatePatch(payload, rules));
  if (JSON.stringify(patch) !== JSON.stringify(expectedPatch)) {
    throw new Error('patch artifact does not match the signed payload');
  }

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

  const workspace = resolve(process.cwd(), process.env.PATCH_WORKSPACE ?? '.');
  const rootReal = realpathSync(workspace);
  const baseSha = process.env.BASE_SHA;
  if (!baseSha || !/^[0-9a-f]{40}$/.test(baseSha))
    throw new Error('base_sha must be a full commit SHA');
  await git(['fetch', '--no-tags', 'origin', baseSha], env);
  const remote = await git(['ls-remote', '--heads', 'origin', `refs/heads/${slug}`], env);
  await git(['checkout', '-B', slug, baseSha], env);

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
  rmSync(resolve(process.cwd(), 'patch.json'), { force: true });

  await git(['add', '-A'], env);
  const tree = await git(['write-tree'], env);
  if (remote) {
    await git(['fetch', 'origin', `refs/heads/${slug}:refs/remotes/origin/${slug}`], env);
    const remoteTree = await git(['rev-parse', `refs/remotes/origin/${slug}^{tree}`], env);
    if (tree !== remoteTree) {
      throw new Error('the Graveshift branch already exists with different content');
    }
    process.stdout.write(
      `::notice::Reusing existing branch ${slug}; the signed patch is already applied.\n`,
    );
  } else {
    await git(
      ['commit', '-m', `graveshift: apply generated patch for ${process.env.WORK_ITEM_ID}`],
      env,
    );
    // An empty expected value creates the ref only if it is still absent.
    await git(
      ['push', `--force-with-lease=refs/heads/${slug}:`, 'origin', `HEAD:refs/heads/${slug}`],
      env,
    );
  }
} catch (error) {
  fail(error);
}
