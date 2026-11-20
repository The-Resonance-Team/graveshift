import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { createApi } from './app';
import { SCENARIOS } from './config';
import { type Db, memoryDb } from './db';
import { createWorker } from './worker';

const env = { HAUNT_TOKEN: 'haunt-secret', OWNER_TOKEN: 'owner-secret', SLOW_CURSE_MS: '40' };
const post = (path: string, token: string | null, body: unknown) =>
  new Request(`http://app${path}`, {
    method: 'POST',
    headers: token ? { 'x-haunt-token': token } : {},
    body: JSON.stringify(body),
  });
const get = (path: string) => new Request(`http://app${path}`);
const haunt = (scenario: string) => post('/__haunt', env.HAUNT_TOKEN, { scenario });

const brokenDb = (): Db => ({
  ...memoryDb(),
  ping: async () => {
    throw new Error('connection refused');
  },
  getCandy: async () => {
    throw new Error('connection refused');
  },
});
const makeApi = () =>
  createApi({
    env: { ...env, DATABASE_URL: 'good', DATABASE_URL_STALE: 'stale' },
    makeDb: (url) => (url === 'stale' ? brokenDb() : memoryDb(40)),
  });

describe('haunt endpoint', () => {
  test('requires HAUNT_TOKEN and a known scenario', async () => {
    const api = makeApi();
    expect((await api.fetch(post('/__haunt', null, { scenario: 'null-candy' }))).status).toBe(401);
    expect((await api.fetch(post('/__haunt', 'wrong', { scenario: 'null-candy' }))).status).toBe(
      401,
    );
    expect((await api.fetch(post('/__haunt', env.HAUNT_TOKEN, { scenario: 'nope' }))).status).toBe(
      400,
    );
    expect((await api.fetch(post('/__haunt', env.HAUNT_TOKEN, 'junk'))).status).toBe(400);
  });

  test('fails closed when no tokens are configured', async () => {
    const api = createApi({ env: {}, makeDb: () => memoryDb() });
    expect((await api.fetch(post('/__haunt', '', { scenario: 'null-candy' }))).status).toBe(401);
    expect((await api.fetch(post('/__reset', '', {}))).status).toBe(401);
  });

  test('reset is owner-only and the haunt token cannot reset', async () => {
    const api = makeApi();
    expect((await api.fetch(post('/__reset', env.HAUNT_TOKEN, {}))).status).toBe(401);
    expect((await api.fetch(post('/__reset', env.OWNER_TOKEN, {}))).status).toBe(200);
  });

  test('property: any scenario name outside the list is rejected with 400', async () => {
    const api = makeApi();
    await fc.assert(
      fc.asyncProperty(
        fc.string().filter((s) => !(SCENARIOS as readonly string[]).includes(s)),
        async (scenario) => {
          expect((await api.fetch(haunt(scenario))).status).toBe(400);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('scenarios', () => {
  test('healthy baseline: candy, healthz and metrics', async () => {
    const api = makeApi();
    expect(await (await api.fetch(get('/candies/1'))).json()).toEqual({
      id: 1,
      name: 'Gummy Ghost',
      price: '1.50',
    });
    expect((await api.fetch(get('/healthz'))).status).toBe(200);
    const metrics = await (await api.fetch(get('/metrics'))).text();
    expect(metrics).toContain('http_requests_total{status="200"}');
    expect(metrics).toContain('http_request_duration_seconds_bucket');
  });

  test('null-candy: TypeError 5xx on GET /candies/:id, reset restores', async () => {
    const api = makeApi();
    await api.fetch(haunt('null-candy'));
    expect((await api.fetch(get('/candies/1'))).status).toBe(500);
    expect((await api.fetch(get('/candies/2'))).status).toBe(200);
    expect(await (await api.fetch(get('/metrics'))).text()).toContain(
      'http_requests_total{status="500"}',
    );
    await api.fetch(post('/__reset', env.OWNER_TOKEN, {}));
    expect((await api.fetch(get('/candies/1'))).status).toBe(200);
  });

  test('wrong-potion: stale database makes healthz fail, reset restores', async () => {
    const api = makeApi();
    await api.fetch(haunt('wrong-potion'));
    expect((await api.fetch(get('/healthz'))).status).toBe(503);
    expect((await api.fetch(get('/candies/1'))).status).toBe(500);
    await api.fetch(post('/__reset', env.OWNER_TOKEN, {}));
    expect((await api.fetch(get('/healthz'))).status).toBe(200);
  });

  test('slow-curse: search latency rises above the injected delay, reset restores', async () => {
    const api = makeApi();
    const timed = async () => {
      const start = performance.now();
      await api.fetch(get('/candies/search?q=gummy'));
      return performance.now() - start;
    };
    expect(await timed()).toBeLessThan(30);
    await api.fetch(haunt('slow-curse'));
    expect(await timed()).toBeGreaterThanOrEqual(35);
    await api.fetch(post('/__reset', env.OWNER_TOKEN, {}));
    expect(await timed()).toBeLessThan(30);
  });

  test('memory-leech: the worker retains memory each tick until reset', async () => {
    const worker = createWorker(env);
    worker.tick();
    expect(worker.retainedBytes()).toBe(0);
    await worker.fetch(haunt('memory-leech'));
    worker.tick();
    worker.tick();
    expect(worker.retainedBytes()).toBeGreaterThan(0);
    expect(await (await worker.fetch(get('/metrics'))).text()).toContain('jobs_processed_total 3');
    await worker.fetch(post('/__reset', env.OWNER_TOKEN, {}));
    expect(worker.retainedBytes()).toBe(0);
  });

  test('image-ghost is accepted and reported as deploy-level', async () => {
    const res = await makeApi().fetch(haunt('image-ghost'));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { note: string }).note).toContain('deploy-level');
  });
});
