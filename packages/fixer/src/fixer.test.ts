import { createVerify, generateKeyPairSync } from 'node:crypto';

import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { appJwt, createAppAuth, GitHubAuthError } from './auth';
import { openDraftPr } from './open-pr';
import { renderPrBody } from './pr-body';
import { PatchRejectedError } from './guard';
import { createRestClient } from './rest';
import { diagnosis, fakeClient, file, incident, repo } from './test-helpers';
import type { Patch } from './types';
import { checkState, type PrEvent, watchPr } from './watch';

describe('openDraftPr', () => {
  const patch: Patch = {
    files: [
      { path: 'src/app.ts', content: 'fixed', linesChanged: 3 },
      { path: 'test/app.test.ts', content: 'test', linesChanged: 10 },
    ],
  };
  const input = {
    repo,
    patch,
    incident,
    diagnosis,
    category: 'code_bug',
    dashboardUrl: 'https://graveshift.example',
  };

  test('pushes a graveshift/ branch and opens a labelled draft PR', async () => {
    const { client, calls } = fakeClient();
    const pr = await openDraftPr({ client, ...input });
    expect(pr).toMatchObject({
      number: 42,
      branch: 'refs/heads/graveshift/inc-inc7f3a9-get-candies-id-calls-tofixed-on-a-null-p',
    });
    expect(calls.map((c) => c.method)).toEqual([
      'getBaseSha',
      'getCommitTree',
      'createBlob',
      'createBlob',
      'createTree',
      'createCommit',
      'createRef',
      'createPullRequest',
      'addLabels',
    ]);
    const create = calls.find((c) => c.method === 'createPullRequest');
    expect(create?.args[1]).toMatchObject({ draft: true });
    expect(calls.find((c) => c.method === 'addLabels')?.args[2]).toEqual([
      'graveshift',
      'exorcism',
    ]);
    expect(calls.find((c) => c.method === 'createRef')?.args[1]).toStartWith(
      'refs/heads/graveshift/',
    );
  });

  test('property: a rejected patch makes zero client calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('deploy/x.yaml', '.github/ci.yml', 'src/k.pem', '../x'),
        async (bad) => {
          const { client, calls } = fakeClient();
          await expect(
            openDraftPr({ client, ...input, patch: { files: [file(bad)] } }),
          ).rejects.toBeInstanceOf(PatchRejectedError);
          expect(calls).toHaveLength(0);
        },
      ),
    );
  });

  test('rejects a service the repo does not cover, before any call', async () => {
    const { client, calls } = fakeClient();
    await expect(
      openDraftPr({ client, ...input, incident: { ...incident, service: 'postgres' } }),
    ).rejects.toMatchObject({ code: 'REPO_NOT_ALLOWED' });
    expect(calls).toHaveLength(0);
  });

  test('the client has no merge method and PR bodies are redacted', () => {
    const { client } = fakeClient();
    expect(Object.keys(client).filter((k) => /merge/i.test(k) && k !== 'getPullRequest')).toEqual(
      [],
    );
    const body = renderPrBody({
      incident,
      diagnosis,
      category: 'code_bug',
      dashboardUrl: 'https://g.example',
      files: ['src/app.ts'],
    });
    expect(body).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(body).toContain('[REDACTED:github_token]');
    expect(body).toContain('https://g.example/incidents/inc-7f3a9c21-aaaa');
    expect(body).toContain('never merged automatically');
  });
});

describe('rest client and app auth', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

  test('app JWT is RS256 signed and expires within 10 minutes', () => {
    const jwt = appJwt('123', pem, 1_800_000_000_000);
    const [h, p, s] = jwt.split('.') as [string, string, string];
    expect(
      createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s, 'base64url')),
    ).toBe(true);
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as {
      iss: string;
      iat: number;
      exp: number;
    };
    expect(claims.iss).toBe('123');
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
  });

  test('tokens come only for installed repos and are cached', async () => {
    let requests = 0;
    const fetchFn = (async () => {
      requests += 1;
      return Response.json({
        token: 'inst-token',
        expires_at: new Date(2_000_000_000_000).toISOString(),
      });
    }) as unknown as typeof fetch;
    const auth = createAppAuth({
      appId: '1',
      privateKeyPem: pem,
      installations: { 'xiro/haunted-candy-shop': 9 },
      fetch: fetchFn,
      now: () => 1_900_000_000_000,
    });
    expect(await auth.installationToken('xiro/haunted-candy-shop')).toBe('inst-token');
    await auth.installationToken('xiro/haunted-candy-shop');
    expect(requests).toBe(1);
    await expect(auth.installationToken('other/repo')).rejects.toBeInstanceOf(GitHubAuthError);
  });

  test('the REST client opens a draft PR and never touches a merge endpoint', async () => {
    const seen: Array<{ method: string; url: string; body: unknown }> = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.push({
        method: init.method ?? 'GET',
        url,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url.includes('/git/ref/')) return Response.json({ object: { sha: 'b' } });
      if (url.includes('/git/commits/b')) return Response.json({ tree: { sha: 't0' } });
      if (url.endsWith('/pulls')) return Response.json({ number: 5, html_url: 'https://x/pull/5' });
      return Response.json({ sha: 's' });
    }) as unknown as typeof fetch;
    const client = createRestClient({ installationToken: async () => 'tok' }, fetchFn);
    await openDraftPr({
      client,
      repo,
      patch: { files: [file('src/a.ts')] },
      incident,
      diagnosis,
      category: 'code_bug',
      dashboardUrl: 'https://g',
    });
    const pull = seen.find((s) => s.url.endsWith('/pulls'));
    expect(pull?.body).toMatchObject({ draft: true, base: 'main' });
    expect(seen.some((s) => /merge/i.test(s.url) || s.method === 'PUT')).toBe(false);
  });
});

describe('check-run polling and merge detection', () => {
  const pr = { repo: repo.repo, number: 42, url: 'u', branch: 'b', headSha: 'commit-sha' };

  test('property: check state is pending if anything is incomplete, failure if any failed, else success', () => {
    const run = fc.record({
      status: fc.constantFrom('queued', 'in_progress', 'completed'),
      conclusion: fc.constantFrom('success', 'failure', 'neutral', null),
    });
    fc.assert(
      fc.property(fc.array(run, { maxLength: 6 }), (runs) => {
        const state = checkState(runs);
        if (runs.some((r) => r.status !== 'completed')) expect(state).toBe('pending');
        else if (runs.some((r) => r.conclusion === 'failure')) expect(state).toBe('failure');
        else expect(state).toBe('success');
      }),
    );
  });

  test('polls on the interval, reports checks, and stops after an external merge', async () => {
    const { client, calls } = fakeClient({
      checks: [
        [{ name: 'ci', status: 'in_progress', conclusion: null }],
        [{ name: 'ci', status: 'completed', conclusion: 'success' }],
      ],
      pr: [
        { state: 'open', merged: false, headSha: 'commit-sha' },
        { state: 'open', merged: false, headSha: 'commit-sha' },
        { state: 'closed', merged: true, headSha: 'commit-sha' },
      ],
    });
    const events: PrEvent[] = [];
    const sleeps: number[] = [];
    const done = Promise.withResolvers<void>();
    watchPr({
      client,
      pr,
      onEvent: (e) => {
        events.push(e);
        if (e.type === 'merged_externally') done.resolve();
      },
      sleep: async (ms) => void sleeps.push(ms),
    });
    await done.promise;
    expect(events.map((e) => (e.type === 'checks' ? e.state : e.type))).toEqual([
      'pending',
      'success',
      'merged_externally',
    ]);
    expect(sleeps).toEqual([30_000, 30_000]);
    expect(calls.some((c) => /merge/i.test(c.method) && c.method !== 'getPullRequest')).toBe(false);
  });

  test('a closed, unmerged PR stops the watch', async () => {
    const { client } = fakeClient({ pr: [{ state: 'closed', merged: false, headSha: 'x' }] });
    const done = Promise.withResolvers<PrEvent>();
    watchPr({ client, pr, onEvent: done.resolve, sleep: async () => {} });
    expect(await done.promise).toEqual({ type: 'closed' });
  });
});
