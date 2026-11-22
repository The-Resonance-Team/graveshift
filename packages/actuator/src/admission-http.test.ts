import { expect, test } from 'bun:test';

import { createAdmissionHttp } from './audit-http';
import { runtimeClaim } from './claims';
import { signed } from './test-helpers';

const config = {
  apiUrl: 'http://127.0.0.1:3000',
  token: 'internal-action-fixture-token-32characters',
  projectId: 'project-1',
};
const input = runtimeClaim(signed());
const completion = {
  tokenId: input.request.approval.tokenId,
  actionId: input.request.action.id,
  requestHash: input.requestHash,
  result: { status: 'executed', reason: 'executed' } as const,
};

test('the controlled client sends claim and completion envelopes to their dedicated routes', async () => {
  const calls: Array<{ path: string; init: RequestInit | undefined }> = [];
  const admission = createAdmissionHttp({
    ...config,
    fetchFn: async (url, init) => {
      calls.push({ path: url.pathname, init });
      return Response.json({ kind: url.pathname.endsWith('/claim') ? 'claimed' : 'completed' });
    },
  });
  expect(await admission.claim(input)).toEqual({ kind: 'claimed' });
  expect(await admission.complete(completion)).toEqual({ kind: 'completed' });
  expect(calls.map((call) => call.path)).toEqual([
    '/internal/actions/claim',
    '/internal/actions/complete',
  ]);
  for (const call of calls) {
    expect(call.init?.method).toBe('POST');
    expect(call.init?.redirect).toBe('error');
    expect(new Headers(call.init?.headers).get('authorization')).toBe(`Bearer ${config.token}`);
  }
  const first = calls[0]?.init?.body;
  const second = calls[1]?.init?.body;
  if (typeof first !== 'string' || typeof second !== 'string')
    throw new Error('Expected JSON bodies');
  expect(JSON.parse(first)).toEqual({ projectId: config.projectId, claim: input });
  expect(JSON.parse(second)).toEqual({ projectId: config.projectId, completion });
});

test.each([
  { kind: 'known', result: completion.result },
  { kind: 'uncertain' },
  { kind: 'denied', reason: 'policy_rate_limited' },
])('claim response $kind preserves its meaning', async (response) => {
  const calls: string[] = [];
  const admission = createAdmissionHttp({
    ...config,
    fetchFn: async (url) => {
      calls.push(url.pathname);
      return Response.json(response);
    },
  });
  expect(await admission.claim(input)).toEqual(response);
  expect(calls).toEqual(['/internal/actions/claim']);
});

test.each([{ key: 'old-audit-ack' }, { kind: 'known' }, { kind: 'claimed', extra: true }])(
  'an invalid claim ACK %j never authorizes runtime',
  async (response) => {
    const calls: string[] = [];
    const admission = createAdmissionHttp({
      ...config,
      fetchFn: async (url) => {
        calls.push(url.pathname);
        return Response.json(response);
      },
    });
    await expect(admission.claim(input)).rejects.toHaveProperty('code', 'AUDIT_ACK_INVALID');
    expect(calls).toHaveLength(1);
  },
);

test('raw claim transport errors are classified safely and never retried', async () => {
  const calls: string[] = [];
  const admission = createAdmissionHttp({
    ...config,
    fetchFn: async (url) => {
      calls.push(url.pathname);
      throw new Error(`Bearer ${config.token}`);
    },
  });
  const error: unknown = await admission.claim(input).catch((caught: unknown) => caught);
  expect(error).toHaveProperty('code', 'AUDIT_UNAVAILABLE');
  expect(String(error)).not.toContain(config.token);
  expect(calls).toHaveLength(1);
});

test('a terminal transport failure is one handoff and never falls back to the generic audit route', async () => {
  const calls: string[] = [];
  const admission = createAdmissionHttp({
    ...config,
    fetchFn: async (url) => {
      calls.push(url.pathname);
      return new Response(`Bearer ${config.token}`, { status: 503 });
    },
  });
  await expect(admission.complete(completion)).rejects.toHaveProperty('code', 'AUDIT_REJECTED');
  expect(calls).toEqual(['/internal/actions/complete']);
});
