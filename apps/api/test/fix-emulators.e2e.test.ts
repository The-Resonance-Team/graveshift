// Offline e2e for the real fix path: real gateway, real GitHub App client, real
// source read and real sandbox. The two stateful local emulators stand in for
// GitHub and the model, so no real key, GitHub call, model call or network.
import { describe, expect, test } from 'bun:test';

import {
  aiCalls,
  openPulls,
  pushedFixBranches,
  readFileAtCommit,
  setCannedReply,
  useFixEmulators,
} from './fix-emulator.setup';
import {
  API_AFTER,
  cannedFixReply,
  checkCommand,
  fixNow,
  GIT_EMPTY_BLOB_SHA,
  harness,
  buildApp,
  seed,
} from './fix-emulator.harness';

const emu = useFixEmulators();
const urls = () => emu.urls();

describe('fix path over emulated GitHub and AI', () => {
  test('a real source read, sandbox check and draft PR publish the real diff', async () => {
    const base = await seed(emu);
    await cannedFixReply(emu, base);
    const { deps, store, reads } = await harness(emu, {
      commands: [checkCommand('export const price = 1;')],
    });
    const app = await buildApp(deps, store);
    try {
      const body = await fixNow(app, 'raise the timeout to 30s');
      expect(body.ok).toBe(true);
      expect(body.failure).toBe('none');
      const pr = body.pr as { number: number; branch: string; headSha: string; openedAt: string };
      expect(pr.number).toBeGreaterThan(0);
      expect(pr.branch).toStartWith('refs/heads/graveshift/');
      expect(pr.headSha).toMatch(/^[0-9a-f]{40}$/);
      expect(pr.openedAt).toBe('2026-11-22T00:00:00.000Z');
      expect(reads).toEqual([`xiro/haunted-candy-shop@main`]);

      const pulls = await openPulls(urls().github);
      expect(pulls).toHaveLength(1);
      const pull = pulls[0];
      if (pull === undefined) throw new Error('expected one pull request');
      expect(pull['draft']).toBe(true);
      expect((pull['head'] as { sha: string }).sha).toBe(pr.headSha);
      expect((pull['base'] as { sha: string }).sha).toBe(base.baseSha);
      const text = String(pull['body'] ?? '');
      expect(text).toContain('### Checks');
      expect(text).toContain(': passed');
      expect(text).toContain('+1/-1');
      expect(text).not.toContain('test-only-key');
      // Identifiers, check results and diff stats only: the title, the root
      // cause and a Fix now note stay on the work item and in the API result.
      expect(text).toContain('wi-e2e-diag-e2e');
      expect(text).not.toContain('raise the timeout to 30s');
      expect(text).not.toContain('Fix the null price on api');
      expect(text).not.toContain('The checkout totals a null price.');
      expect(text).not.toContain('Root cause');
      expect(text).not.toContain('untrusted');

      // The head tree holds the applied diff, read back as real git objects.
      expect(await readFileAtCommit(urls().github, pr.headSha, 'src/api.ts')).toBe(API_AFTER);
      expect(await readFileAtCommit(urls().github, pr.headSha, 'README.md')).toContain('# ');

      const calls = await aiCalls(urls().ai);
      const prompt = JSON.stringify(calls);
      // The emulator redacts high-entropy strings in the recorded prompt, so the
      // SHAs are checked as markers here and as real values in the reply below.
      expect(prompt).toContain('export const price = null;');
      expect(prompt).toContain('Base commit SHA:');
      expect(prompt).toContain('<untrusted_source_file_src/api.ts>');
      expect(prompt).toContain('Echo baseSha and every baseBlobSha exactly');
      const reply = JSON.stringify(
        (calls[0] as { matched?: { rule?: { reply?: unknown } } }).matched,
      );
      expect(reply).toContain(base.baseSha);
      expect(reply).toContain(base.files['src/api.ts']?.blobSha ?? '');
      expect(prompt).not.toContain('test-only-key');
      expect(prompt).not.toContain(emu.appPrivateKey());
    } finally {
      await app.close();
    }
  });

  test('a policy denial stops everything before the first source read', async () => {
    const base = await seed(emu);
    await cannedFixReply(emu, base);
    const { deps, store, reads } = await harness(emu, { denyPolicy: true });
    const app = await buildApp(deps, store);
    try {
      const body = await fixNow(app);
      expect(body.ok).toBe(false);
      expect(body.failure).toBe('policy_denied');
      expect(reads).toHaveLength(0);
      expect(await pushedFixBranches(urls().github)).toEqual([]);
      expect(await openPulls(urls().github)).toEqual([]);
      expect(await aiCalls(urls().ai)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('a service the config never maps is rejected before the first source read', async () => {
    const base = await seed(emu);
    await cannedFixReply(emu, base);
    const { deps, store, reads } = await harness(emu, {
      commands: [checkCommand('export const price = 1;')],
      services: ['billing'],
    });
    const app = await buildApp(deps, store);
    try {
      const body = await fixNow(app);
      expect(body.ok).toBe(false);
      expect(body.failure).toBe('policy_denied');
      expect(String(body.reason)).toContain('repo_not_allowed');
      // The policy gate stops it: no source read, no model call, no GitHub call.
      expect(reads).toHaveLength(0);
      expect(await aiCalls(urls().ai)).toEqual([]);
      expect(await pushedFixBranches(urls().github)).toEqual([]);
      expect(await openPulls(urls().github)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('a failed sandbox check blocks the pull request', async () => {
    const base = await seed(emu);
    await cannedFixReply(emu, base);
    const { deps, store } = await harness(emu, { commands: [checkCommand('never written')] });
    const app = await buildApp(deps, store);
    try {
      const body = await fixNow(app);
      expect(body.ok).toBe(false);
      expect(body.failure).toBe('checks_failed');
      expect(await pushedFixBranches(urls().github)).toEqual([]);
      expect(await openPulls(urls().github)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('a base that moved after the read publishes nothing', async () => {
    const base = await seed(emu);
    await cannedFixReply(emu, base);
    const { deps, store } = await harness(emu, {
      commands: [checkCommand('export const price = 1;')],
      commitAfterRead: true,
    });
    const app = await buildApp(deps, store);
    try {
      const body = await fixNow(app);
      expect(body.ok).toBe(false);
      expect(body.failure).toBe('stale_base');
      expect(await pushedFixBranches(urls().github)).toEqual([]);
      expect(await openPulls(urls().github)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('a forbidden path never reaches GitHub', async () => {
    const base = await seed(emu);
    await setCannedReply(urls().ai, {
      baseSha: base.baseSha,
      files: [
        {
          path: '.github/workflows/ci.yaml',
          baseBlobSha: GIT_EMPTY_BLOB_SHA,
          content: 'on: push\n',
          linesChanged: 1,
        },
      ],
    });
    const { deps, store } = await harness(emu, { commands: [checkCommand('')] });
    const app = await buildApp(deps, store);
    try {
      const body = await fixNow(app);
      expect(body.ok).toBe(false);
      expect(body.failure).toBe('patch_rejected');
      expect(await pushedFixBranches(urls().github)).toEqual([]);
      expect(await openPulls(urls().github)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('a diff whose context no longer matches is rejected', async () => {
    const base = await seed(emu);
    const file = base.files['src/api.ts'];
    if (file === undefined) throw new Error('the seeded file is missing from the base tree');
    await setCannedReply(urls().ai, {
      baseSha: base.baseSha,
      files: [
        {
          path: 'src/api.ts',
          baseBlobSha: file.blobSha,
          diff: '@@ -1 +1 @@\n-export const gone = true;\n+export const price = 1;\n',
          linesChanged: 1,
        },
      ],
    });
    const { deps, store } = await harness(emu, {
      commands: [checkCommand('export const price = 1;')],
    });
    const app = await buildApp(deps, store);
    try {
      const body = await fixNow(app);
      expect(body.ok).toBe(false);
      expect(body.failure).toBe('patch_rejected');
      expect(await pushedFixBranches(urls().github)).toEqual([]);
      expect(await openPulls(urls().github)).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
