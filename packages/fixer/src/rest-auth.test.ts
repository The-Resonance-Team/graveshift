import { createVerify, generateKeyPairSync } from 'node:crypto';

import { describe, expect, test } from 'bun:test';

import { appJwt, createAppAuth, GitHubAuthError } from './auth';
import { openDraftPr } from './open-pr';
import { createRestClient } from './rest';
import { diagnosis, file, incident, repo } from './test-helpers';

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
      base: { sha: 'b', treeSha: 't0' },
      checks: [
        {
          command: ['bun', 'test'],
          exitCode: 0,
          timedOut: false,
          stdout: '',
          stderr: '',
          stdoutTruncated: false,
          stderrTruncated: false,
        },
      ],
      diff: { filesChanged: 1, additions: 1, deletions: 0 },
      now: () => new Date('2026-11-22T00:00:00.000Z'),
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
