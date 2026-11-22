import { createVerify, generateKeyPairSync } from 'node:crypto';

import { describe, expect, test } from 'bun:test';

import { appJwt, createAppAuth, GitHubAuthError } from './auth';
import { repo } from './test-helpers';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const start = 1_900_000_000_000;
const options = {
  appId: '1',
  privateKeyPem: pem,
  installations: { [repo.repo]: 9 },
  now: () => start,
};

function controlledFetch() {
  const requests: Array<{
    input: Parameters<typeof fetch>[0];
    response: PromiseWithResolvers<Response>;
  }> = [];
  const fetchFn: typeof fetch = Object.assign(
    (input: Parameters<typeof fetch>[0]) => {
      const response = Promise.withResolvers<Response>();
      requests.push({ input, response });
      return response.promise;
    },
    { preconnect: fetch.preconnect },
  );
  function responseAt(index: number) {
    const request = requests[index];
    if (request === undefined) throw new Error(`missing request ${index}`);
    return request.response;
  }
  return { fetchFn, requests, responseAt };
}

const tokenResponse = (token: string, expiresAt = start + 120_000) =>
  Response.json({ token, expires_at: new Date(expiresAt).toISOString() });

test('app JWT is RS256 signed and expires within 10 minutes', () => {
  const [header, payload, signature] = appJwt('123', pem, 1_800_000_000_000).split('.');
  if (header === undefined || payload === undefined || signature === undefined) {
    throw new Error('expected a JWT');
  }
  expect(
    createVerify('RSA-SHA256')
      .update(`${header}.${payload}`)
      .verify(publicKey, Buffer.from(signature, 'base64url')),
  ).toBe(true);
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  expect(claims.iss).toBe('123');
  expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
});

describe('installation credential refresh', () => {
  test('coalesces concurrent misses and refreshes together at the expiry margin', async () => {
    const { fetchFn, requests, responseAt } = controlledFetch();
    let now = start;
    const auth = createAppAuth({ ...options, fetch: fetchFn, now: () => now });
    const first = Promise.all([
      auth.installationToken(repo.repo),
      auth.installationToken(repo.repo),
      auth.installationToken(repo.repo),
    ]);
    expect(requests).toHaveLength(1);
    expect(String(requests[0]?.input)).toBe(
      'https://api.github.com/app/installations/9/access_tokens',
    );
    responseAt(0).resolve(tokenResponse('first'));
    expect(await first).toEqual(['first', 'first', 'first']);

    now += 59_999;
    expect(await auth.installationToken(repo.repo)).toBe('first');
    expect(requests).toHaveLength(1);
    now += 1;
    const refreshed = Promise.all([
      auth.installationToken(repo.repo),
      auth.installationToken(repo.repo),
    ]);
    expect(requests).toHaveLength(2);
    responseAt(1).resolve(tokenResponse('refreshed', now + 3_600_000));
    expect(await refreshed).toEqual(['refreshed', 'refreshed']);
    expect(await auth.installationToken(repo.repo)).toBe('refreshed');
    expect(requests).toHaveLength(2);
  });

  test('isolates pending refreshes and cached tokens by repo and auth instance', async () => {
    const { fetchFn, requests, responseAt } = controlledFetch();
    const installed = { ...options, installations: { 'owner/one': 9, 'owner/two': 9 } };
    const firstAuth = createAppAuth({ ...installed, fetch: fetchFn });
    const secondAuth = createAppAuth({ ...installed, fetch: fetchFn });
    const tokens = Promise.all([
      firstAuth.installationToken('owner/one'),
      firstAuth.installationToken('owner/one'),
      firstAuth.installationToken('owner/two'),
      secondAuth.installationToken('owner/one'),
    ]);
    expect(requests).toHaveLength(3);
    responseAt(0).resolve(tokenResponse('first-repo'));
    responseAt(1).resolve(tokenResponse('second-repo'));
    responseAt(2).resolve(tokenResponse('second-auth'));
    expect(await tokens).toEqual(['first-repo', 'first-repo', 'second-repo', 'second-auth']);
    expect(await firstAuth.installationToken('owner/two')).toBe('second-repo');
    expect(await secondAuth.installationToken('owner/one')).toBe('second-auth');
    expect(requests).toHaveLength(3);
  });

  const failures: Array<{
    name: string;
    settle: (response: PromiseWithResolvers<Response>) => void;
  }> = [
    {
      name: 'HTTP failure',
      settle: (response) => response.resolve(new Response('private-token', { status: 503 })),
    },
    { name: 'transport failure', settle: (response) => response.reject(new Error('offline')) },
    {
      name: 'invalid response',
      settle: (response) => response.resolve(Response.json({ token: '', expires_at: 'invalid' })),
    },
  ];
  test.each(failures)('shares $name and permits a fresh retry', async ({ settle }) => {
    const { fetchFn, requests, responseAt } = controlledFetch();
    const auth = createAppAuth({ ...options, fetch: fetchFn });
    const failed = Promise.allSettled([
      auth.installationToken(repo.repo),
      auth.installationToken(repo.repo),
    ]);
    expect(requests).toHaveLength(1);
    settle(responseAt(0));
    const outcomes = await failed;
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['rejected', 'rejected']);
    for (const outcome of outcomes) {
      if (outcome.status !== 'rejected') throw new Error('expected refresh failure');
      expect(String(outcome.reason)).not.toContain('private-token');
    }

    const retried = Promise.all([
      auth.installationToken(repo.repo),
      auth.installationToken(repo.repo),
    ]);
    expect(requests).toHaveLength(2);
    responseAt(1).resolve(tokenResponse('recovered'));
    expect(await retried).toEqual(['recovered', 'recovered']);
    expect(await auth.installationToken(repo.repo)).toBe('recovered');
    expect(requests).toHaveLength(2);
  });

  test('an uninstalled repo makes no credential request', async () => {
    const { fetchFn, requests } = controlledFetch();
    const auth = createAppAuth({ ...options, fetch: fetchFn });
    await expect(auth.installationToken('other/repo')).rejects.toBeInstanceOf(GitHubAuthError);
    expect(requests).toHaveLength(0);
  });
});
