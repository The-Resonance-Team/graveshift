import { generateKeyPairSync } from 'node:crypto';

import { expect, test } from 'bun:test';

import { createAppAuth } from './auth';
import { createRestClient } from './rest';
import { repo } from './test-helpers';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = 1_900_000_000_000;
const options = {
  appId: '1',
  privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
  installations: { [repo.repo]: 9 },
  now: () => now,
};

const tokenResponse = (token: string) =>
  Response.json({ token, expires_at: new Date(now + 120_000).toISOString() });

function deferredTransport() {
  const requests: Array<{ response: PromiseWithResolvers<Response>; signal: AbortSignal }> = [];
  const fetchFn: typeof fetch = Object.assign(
    (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!(init?.signal instanceof AbortSignal))
        throw new Error('refresh needs a deadline signal');
      const response = Promise.withResolvers<Response>();
      requests.push({ response, signal: init.signal });
      return response.promise;
    },
    { preconnect: fetch.preconnect },
  );
  const requestAt = (index: number) => {
    const request = requests[index];
    if (!request) throw new Error(`missing request ${index}`);
    return request;
  };
  return { fetchFn, requests, requestAt };
}

test.each(['headers', 'body', 'body cancellation', 'ignored cancellation'])(
  'one deadline bounds stalled %s and a shared refresh can retry',
  async (phase) => {
    const { fetchFn, requests, requestAt } = deferredTransport();
    const auth = createAppAuth({ ...options, fetch: fetchFn, timeoutMs: 20 });
    const failed = Promise.allSettled([
      auth.installationToken(repo.repo),
      auth.installationToken(repo.repo),
    ]);
    const first = requestAt(0);
    let canceled = false;
    if (phase === 'headers') {
      first.signal.addEventListener('abort', () => first.response.reject(first.signal.reason), {
        once: true,
      });
    }
    if (phase.startsWith('body')) {
      first.response.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"token":"private-partial-token'));
            },
            cancel() {
              canceled = true;
              if (phase === 'body cancellation') return new Promise<void>(() => {});
            },
          }),
        ),
      );
    }
    const failures = await failed;
    expect(requests).toHaveLength(1);
    expect(first.signal.aborted).toBe(true);
    expect(failures.map((failure) => failure.status)).toEqual(['rejected', 'rejected']);
    for (const failure of failures) {
      if (failure.status !== 'rejected') throw new Error('expected a refresh timeout');
      expect(failure.reason).toMatchObject({
        code: 'GITHUB_AUTH_FAILED',
        message: 'installation token request timed out',
      });
      expect(String(failure.reason)).not.toContain('private-partial-token');
    }
    if (phase.startsWith('body')) expect(canceled).toBe(true);

    const recovered = Promise.all([
      auth.installationToken(repo.repo),
      auth.installationToken(repo.repo),
    ]);
    expect(requests).toHaveLength(2);
    requestAt(1).response.resolve(tokenResponse('recovered'));
    expect(await recovered).toEqual(['recovered', 'recovered']);
    if (phase === 'ignored cancellation') {
      const canceledLateBody = Promise.withResolvers<void>();
      first.response.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('private-late-token'));
            },
            cancel() {
              canceledLateBody.resolve();
            },
          }),
        ),
      );
      await canceledLateBody.promise;
    }
    expect(await auth.installationToken(repo.repo)).toBe('recovered');
    expect(requests).toHaveLength(2);
  },
);

test.each([
  { name: 'invalid JSON', text: 'private-invalid-json-token' },
  { name: 'excessive body', text: 'x'.repeat(64 * 1024 + 1) },
  {
    name: 'invalid expiry',
    text: JSON.stringify({ token: 'private-invalid-expiry-token', expires_at: 'not-a-date' }),
  },
])('$name stays bounded and its text does not reach the error', async ({ text }) => {
  const { fetchFn, requestAt } = deferredTransport();
  const auth = createAppAuth({ ...options, fetch: fetchFn });
  const result = auth.installationToken(repo.repo);
  requestAt(0).response.resolve(new Response(text));
  await expect(result).rejects.toMatchObject({ code: 'GITHUB_AUTH_FAILED' });
  try {
    await result;
  } catch (error) {
    expect(String(error)).not.toContain('private-');
    expect(String(error).length).toBeLessThan(200);
  }
});

test.each([0, -1, 30_001, Infinity])('rejects an invalid refresh timeout of %s', (timeoutMs) => {
  expect(() => createAppAuth({ ...options, timeoutMs })).toThrow(
    'invalid installation token timeout',
  );
});

test('a REST call waiting for credentials stops at the refresh deadline', async () => {
  const { fetchFn, requests } = deferredTransport();
  const auth = createAppAuth({ ...options, fetch: fetchFn, timeoutMs: 20 });
  let repositoryCalls = 0;
  const repositoryFetch: typeof fetch = Object.assign(
    async () => {
      repositoryCalls++;
      return Response.json({ object: { sha: 'base' } });
    },
    { preconnect: fetch.preconnect },
  );
  const client = createRestClient(auth, repositoryFetch);
  await expect(client.getCommitTree(repo.repo, 'base-sha')).rejects.toMatchObject({
    code: 'GITHUB_AUTH_FAILED',
    message: 'installation token request timed out',
  });
  expect(requests).toHaveLength(1);
  expect(repositoryCalls).toBe(0);
});
