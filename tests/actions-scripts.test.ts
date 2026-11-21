import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

import { repoRules } from '../scripts/actions/one-shot';
import { signPolicyDecision } from '../scripts/actions/policy-signature';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const applyScript = join(root, 'scripts', 'actions', 'apply-patch.ts');
const policyFile = join(root, 'policy.example.yaml');

type Sandbox = { dir: string; work: string; remote: string; env: Record<string, string> };

const cleanEnv = (home: string): Record<string, string> => ({
  PATH: process.env.PATH ?? '',
  HOME: home,
  XDG_CONFIG_HOME: home,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
});

const git = async (
  args: readonly string[],
  cwd: string,
  env: Record<string, string>,
): Promise<string> => {
  const child = Bun.spawn(['git', ...args], { cwd, env, stdout: 'pipe', stderr: 'pipe' });
  const code = await child.exited;
  const out = await new Response(child.stdout).text();
  const error = await new Response(child.stderr).text();
  if (code !== 0) throw new Error(`git ${args[0] ?? ''} failed: ${error}`);
  return out.trim();
};

const sandbox = async (): Promise<Sandbox> => {
  const dir = mkdtempSync(join(tmpdir(), 'graveshift-oneshot-'));
  const work = join(dir, 'work');
  const remote = join(dir, 'remote.git');
  const home = join(dir, 'home');
  mkdirSync(work, { recursive: true });
  mkdirSync(home, { recursive: true });

  // The setup commit has identity; the apply step below does not.
  const setupEnv = {
    ...cleanEnv(home),
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.test',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.test',
  };
  await git(['init', '--initial-branch=main', '--bare', '-q', remote], dir, setupEnv);
  await git(['init', '--initial-branch=main', '-q'], work, setupEnv);
  mkdirSync(join(work, 'src'));
  writeFileSync(join(work, 'src', 'hello.txt'), 'hello\n');
  copyFileSync(policyFile, join(work, 'policy.example.yaml'));
  await git(['add', '-A'], work, setupEnv);
  await git(['commit', '-qm', 'base'], work, setupEnv);
  await git(['remote', 'add', 'origin', remote], work, setupEnv);
  await git(['push', '-q', '-u', 'origin', 'HEAD'], work, setupEnv);

  writeFileSync(
    join(work, 'patch.json'),
    JSON.stringify({
      files: [{ path: 'src/hello.txt', content: 'hello patched\n', linesChanged: 1 }],
    }),
  );

  const decision = {
    effect: 'allow',
    action: 'open_pr',
    reason: 'rule:pr-for-code-bugs',
    matchedRule: 'pr-for-code-bugs',
    context: {
      service: 'api',
      category: 'code_bug',
      signals: [],
      confidence: 0.9,
      counters: {
        openPrsLastHour: 0,
        actionsLast10Min: 0,
        diagnosisLoops: 0,
        llmSpentTodayUsd: 0,
      },
    },
  };
  const patchPayload = JSON.stringify({
    files: [{ path: 'src/hello.txt', content: 'hello patched\n', linesChanged: 1 }],
  });
  const binding = {
    repository: 'xiro/haunted-candy-shop',
    workItemId: 'wi-123',
    incidentRef: 'diag-123',
    branchSlug: 'graveshift/inc-abc123-fix',
    baseRef: 'main',
    baseSha: await git(['rev-parse', 'HEAD'], work, setupEnv),
    prTitle: 'Fix the API issue',
    patchPayload,
  };
  const signed = signPolicyDecision(
    JSON.stringify(decision),
    binding,
    'test-policy-signing-key-with-at-least-32-chars',
  );
  return {
    dir,
    work,
    remote,
    env: {
      ...cleanEnv(home),
      BASE_REF: 'main',
      BASE_SHA: binding.baseSha,
      WORK_ITEM_ID: binding.workItemId,
      INCIDENT_REF: binding.incidentRef,
      BRANCH_SLUG: 'graveshift/inc-abc123-fix',
      PATCH_PAYLOAD: patchPayload,
      POLICY_DECISION: signed.policyDecision,
      POLICY_SIGNATURE: signed.signature,
      POLICY_SIGNING_KEY: 'test-policy-signing-key-with-at-least-32-chars',
      PR_TITLE: binding.prTitle,
      PR_TOKEN: 'dummy-token',
      GITHUB_REPOSITORY: 'xiro/haunted-candy-shop',
      POLICY_PATH: 'policy.example.yaml',
    },
  };
};

const runApply = async (
  box: Sandbox,
  overrides: Record<string, string> = {},
): Promise<{ code: number; error: string }> => {
  const child = Bun.spawn(['bun', 'run', applyScript], {
    cwd: box.work,
    env: { ...box.env, ...overrides },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const code = await child.exited;
  const error = await new Response(child.stderr).text();
  return { code, error };
};

const withRepo = async <T>(fn: (box: Sandbox) => Promise<T>): Promise<T> => {
  const box = await sandbox();
  try {
    return await fn(box);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
};

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
      writeFileSync(
        join(box.work, 'patch.json'),
        JSON.stringify({
          files: [{ path: 'src/hello.txt', content: 'hello patched\n', linesChanged: 1 }],
        }),
      );
      const retry = await runApply(box);
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
            files: [
              {
                path: dangling ? 'src/link' : 'src/link/escaped.txt',
                content: 'x\n',
                linesChanged: 1,
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
