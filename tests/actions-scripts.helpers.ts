import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { signPolicyDecision } from '../scripts/actions/policy-signature';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const applyScript = join(root, 'scripts', 'actions', 'apply-patch.ts');
const configFile = join(root, 'graveshift.config.yaml');

export type Sandbox = {
  dir: string;
  work: string;
  remote: string;
  baseSha: string;
  env: Record<string, string>;
};

const cleanEnv = (home: string): Record<string, string> => ({
  PATH: process.env.PATH ?? '',
  HOME: home,
  XDG_CONFIG_HOME: home,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
});

export const git = async (
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
  copyFileSync(configFile, join(work, 'graveshift.config.yaml'));
  await git(['add', '-A'], work, setupEnv);
  await git(['commit', '-qm', 'base'], work, setupEnv);
  await git(['remote', 'add', 'origin', remote], work, setupEnv);
  await git(['push', '-q', '-u', 'origin', 'HEAD'], work, setupEnv);

  const baseSha = await git(['rev-parse', 'HEAD'], work, setupEnv);
  writeFileSync(
    join(work, 'patch.json'),
    JSON.stringify({
      baseSha,
      files: [
        {
          path: 'src/hello.txt',
          content: 'hello patched\n',
          linesChanged: 1,
          baseBlobSha: 'ce013625030ba8dba906f756967f9e9ca394464a',
        },
      ],
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
    baseSha,
    files: [
      {
        path: 'src/hello.txt',
        content: 'hello patched\n',
        linesChanged: 1,
        baseBlobSha: 'ce013625030ba8dba906f756967f9e9ca394464a',
      },
    ],
  });
  const binding = {
    repository: 'xiro/haunted-candy-shop',
    workItemId: 'wi-123',
    incidentRef: 'diag-123',
    branchSlug: 'graveshift/inc-abc123-fix',
    // Bind to the same immutable commit the apply step resolves BASE_REF to;
    // a moving 'main' would not match the env and would break the retry test.
    baseRef: baseSha,
    baseSha,
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
    baseSha,
    env: {
      ...cleanEnv(home),
      // Bind to the base commit, not a moving branch: the retry test advances main.
      BASE_REF: baseSha,
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
      GRAVESHIFT_CONFIG_PATH: 'graveshift.config.yaml',
    },
  };
};

export const runApply = async (
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

export const withRepo = async <T>(fn: (box: Sandbox) => Promise<T>): Promise<T> => {
  const box = await sandbox();
  try {
    return await fn(box);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
};
