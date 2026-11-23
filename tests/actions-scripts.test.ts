import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { EMPTY_BLOB_SHA } from '@graveshift/patch';

import { repoRules } from '../scripts/actions/one-shot';
import { signPolicyDecision } from '../scripts/actions/policy-signature';

import { git, runApply, withRepo, type Sandbox } from './actions-scripts.helpers';

describe('one-shot scripts', () => {
  test('apply-patch commits with identity and pushes from a clean git config', async () => {
    await withRepo(async (box) => {
      const result = await runApply(box);
      expect(result.code, result.error).toBe(0);
      const content = await git(
        ['--git-dir', box.remote, 'show', 'graveshift/inc-abc123-fix:src/hello.txt'],
        box.dir,
        box.env,
      );
      expect(content).toBe('hello patched');
      const author = await git(
        ['--git-dir', box.remote, 'log', '-1', '--format=%an <%ae>', 'graveshift/inc-abc123-fix'],
        box.dir,
        box.env,
      );
      expect(author).toBe('Graveshift <graveshift@users.noreply.github.com>');
    });
  });

  test('retry reuses the original commit even after the base advances', async () => {
    await withRepo(async (box) => {
      const first = await runApply(box);
      expect(first.code, first.error).toBe(0);
      const shaBefore = await git(
        ['--git-dir', box.remote, 'rev-parse', 'refs/heads/graveshift/inc-abc123-fix'],
        box.dir,
        box.env,
      );
      await git(['checkout', 'main'], box.work, box.env);
      writeFileSync(join(box.work, 'unrelated.txt'), 'new main content\n');
      await git(['add', 'unrelated.txt'], box.work, box.env);
      await git(
        [
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.test',
          'commit',
          '-m',
          'advance main',
        ],
        box.work,
        box.env,
      );
      await git(['push', 'origin', 'main'], box.work, box.env);
      // A retry re-signs the same patch for the new job. Restore the artifact
      // the first run consumed so it still matches the signed payload.
      const retryPayload = box.env.PATCH_PAYLOAD ?? '';
      writeFileSync(join(box.work, 'patch.json'), retryPayload);
      const original = box.env.POLICY_DECISION ?? '';
      const signed = signPolicyDecision(
        original,
        { ...JSON.parse(original).signed, patchPayload: retryPayload },
        box.env.POLICY_SIGNING_KEY ?? '',
      );
      const retry = await runApply(box, {
        POLICY_DECISION: signed.policyDecision,
        POLICY_SIGNATURE: signed.signature,
      });
      expect(retry.code, retry.error).toBe(0);
      const shaAfter = await git(
        ['--git-dir', box.remote, 'rev-parse', 'refs/heads/graveshift/inc-abc123-fix'],
        box.dir,
        box.env,
      );
      expect(shaAfter).toBe(shaBefore);
    });
  });

  test('matching signed patches reject existing and dangling symlinks', async () => {
    await Promise.all(
      [false, true].map((dangling) =>
        withRepo(async (box) => {
          const outside = join(box.dir, 'outside');
          if (!dangling) mkdirSync(outside);
          symlinkSync(outside, join(box.work, 'src', 'link'));
          const payload = JSON.stringify({
            baseSha: box.baseSha,
            files: [
              {
                path: dangling ? 'src/link' : 'src/link/escaped.txt',
                content: 'x\n',
                linesChanged: 1,
                baseBlobSha: EMPTY_BLOB_SHA,
              },
            ],
          });
          writeFileSync(join(box.work, 'patch.json'), payload);
          const original = box.env.POLICY_DECISION ?? '';
          const signed = signPolicyDecision(
            original,
            { ...JSON.parse(original).signed, patchPayload: payload },
            box.env.POLICY_SIGNING_KEY ?? '',
          );
          const result = await runApply(box, {
            PATCH_PAYLOAD: payload,
            POLICY_DECISION: signed.policyDecision,
            POLICY_SIGNATURE: signed.signature,
          });
          expect(result.code).not.toBe(0);
          expect(result.error).toContain('crosses a symlink');
          expect(existsSync(dangling ? outside : join(outside, 'escaped.txt'))).toBe(false);
        }),
      ),
    );
  });

  const resign = (box: Sandbox, payload: string, extra: Record<string, string> = {}) => {
    const original = box.env.POLICY_DECISION ?? '';
    const bound = { ...JSON.parse(original).signed, patchPayload: payload, ...extra };
    const signed = signPolicyDecision(original, bound, box.env.POLICY_SIGNING_KEY ?? '');
    writeFileSync(join(box.work, 'patch.json'), payload);
    return {
      PATCH_PAYLOAD: payload,
      POLICY_DECISION: signed.policyDecision,
      POLICY_SIGNATURE: signed.signature,
    };
  };
  const branchExists = async (box: Sandbox) =>
    (await git(['--git-dir', box.remote, 'branch', '--list', 'graveshift/*'], box.dir, box.env)) !==
    '';

  test('a BASE_SHA that differs from patch.baseSha blocks every write', async () => {
    await withRepo(async (box) => {
      const other = 'a'.repeat(40);
      const file = { path: 'src/hello.txt', content: 'x\n', linesChanged: 1 };
      const payload = JSON.stringify({
        baseSha: box.baseSha,
        files: [{ ...file, baseBlobSha: 'ce013625030ba8dba906f756967f9e9ca394464a' }],
      });
      const result = await runApply(box, {
        ...resign(box, payload, { baseSha: other }),
        BASE_SHA: other,
      });
      expect(result.code).not.toBe(0);
      expect(result.error).toContain('patch base does not match');
      expect(await branchExists(box)).toBe(false);
      expect(existsSync(join(box.work, 'patch.json'))).toBe(true);
    });
  });

  test('a stale baseBlobSha blocks every write', async () => {
    await withRepo(async (box) => {
      const payload = JSON.stringify({
        baseSha: box.baseSha,
        files: [
          { path: 'src/hello.txt', content: 'x\n', linesChanged: 1, baseBlobSha: 'b'.repeat(40) },
        ],
      });
      const result = await runApply(box, resign(box, payload));
      expect(result.code).not.toBe(0);
      expect(result.error).toContain('src/hello.txt: file changed since the patch was made');
      expect(await branchExists(box)).toBe(false);
      expect(existsSync(join(box.work, 'patch.json'))).toBe(true);
      expect(await Bun.file(join(box.work, 'src', 'hello.txt')).text()).toBe('hello\n');
    });
  });

  test('unsafe slug and base ref fail before the patch is consumed', async () => {
    await withRepo(async (box) => {
      const badSlug = await runApply(box, { BRANCH_SLUG: 'main' });
      expect(badSlug.code).not.toBe(0);
      expect(existsSync(join(box.work, 'patch.json'))).toBe(true);
      const badRef = await runApply(box, { BASE_REF: '../main' });
      expect(badRef.code).not.toBe(0);
      expect(existsSync(join(box.work, 'patch.json'))).toBe(true);
    });
  });

  test('signature binds the work item, branch, base, title, repository and patch bytes', async () => {
    await withRepo(async (box) => {
      const result = await runApply(box, { PATCH_PAYLOAD: `${box.env.PATCH_PAYLOAD} ` });
      expect(result.code).not.toBe(0);
      expect(result.error).toContain('signed decision does not match this job');
      expect(existsSync(join(box.work, 'patch.json'))).toBe(true);
    });
  });

  test('repo rules fail closed for an unknown repository', async () => {
    const original = process.env.GITHUB_REPOSITORY;
    process.env.GITHUB_REPOSITORY = 'evil/repo';
    try {
      await expect(repoRules()).rejects.toMatchObject({ code: 'REPO_RULES_UNKNOWN' });
    } finally {
      if (original === undefined) delete process.env.GITHUB_REPOSITORY;
      else process.env.GITHUB_REPOSITORY = original;
    }
  });
});
