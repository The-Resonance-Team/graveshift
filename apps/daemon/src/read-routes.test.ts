import { describe, expect, test } from 'bun:test';

import { createReadState } from './read-state';
import { createRequestHandler } from './routes';

const TOKEN = 'test-only-read-token';
const handler = () => createRequestHandler(createReadState(), TOKEN);
const get = async (path: string, token?: string) =>
  handler()(
    new Request(`http://127.0.0.1:2602${path}`, {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    }),
  );

describe('daemon read routes', () => {
  test('health stays unauthenticated and carries liveness only', async () => {
    const response = await get('/healthz');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('a missing token gets 401 on every read route', async () => {
    const paths = ['/read/services', '/read/incidents', '/read/counters'];
    await Promise.all(
      paths.map(async (path) => {
        const response = await get(path);
        expect(response.status).toBe(401);
        expect(((await response.json()) as { error: string }).error).toBe('unauthorized');
      }),
    );
  });

  test('a wrong token gets 401', async () => {
    const response = await get('/read/services', 'wrong-token');
    expect(response.status).toBe(401);
  });

  test('a valid token returns daemon-owned data, not an empty stub', async () => {
    const state = createReadState();
    state.recordIncident({
      incident: {
        id: 'inc-1',
        service: 'api',
        state: 'open',
        openedAt: '2026-01-01T00:00:00.000Z',
      },
      detections: [{ rule: 'crash_loop' }],
    });
    const response = await createRequestHandler(
      state,
      TOKEN,
    )(
      new Request('http://127.0.0.1:2602/read/incidents', {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ incident: { id: string } }>;
    expect(body[0]?.incident.id).toBe('inc-1');
  });

  test('one incident and the limit counters are served', async () => {
    const state = createReadState();
    state.setCounters(
      {
        openPrsLastHour: 3,
        actionsLast10Min: 0,
        diagnosisLoops: 0,
        llmSpentTodayUsd: 0,
      },
      'wired',
    );
    const request = createRequestHandler(state, TOKEN);
    const counters = await request(
      new Request('http://127.0.0.1:2602/read/counters', {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    );
    expect(await counters.json()).toMatchObject({
      source: 'wired',
      counters: { openPrsLastHour: 3 },
    });
  });

  test('a non-GET read returns 405 and the read routes stay read-only', async () => {
    const response = await handler()(
      new Request('http://127.0.0.1:2602/read/services', {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });

  test('a read with missing query input gets 400', async () => {
    const response = await get('/read/logs', TOKEN);
    expect(response.status).toBe(400);
  });

  test('an unknown read route gets 404 with a distinct error body', async () => {
    const response = await get('/read/nope', TOKEN);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'unknown_route' });
  });

  test('audit query bounds reject invalid afterSeq and limit values', async () => {
    const responses = await Promise.all([
      get('/read/audit?afterSeq=-1', TOKEN),
      get('/read/audit?limit=0', TOKEN),
      get('/read/audit?limit=abc', TOKEN),
    ]);
    for (const response of responses) expect(response.status).toBe(400);
  });

  test('audit query bounds cap the requested limit', async () => {
    const state = createReadState();
    for (let seq = 1; seq <= 5; seq += 1) {
      state.appendAudit({
        at: '2026-01-01T00:00:00.000Z',
        actor: 'wraith',
        type: 'incident.opened',
        payload: {},
      });
    }
    const response = await createRequestHandler(
      state,
      TOKEN,
    )(
      new Request('http://127.0.0.1:2602/read/audit?afterSeq=1&limit=2', {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    );
    const entries = (await response.json()) as Array<{ seq: number }>;
    expect(entries.map((entry) => entry.seq)).toEqual([2, 3]);
  });

  test('a tampered audit entry is reported by the verify route', async () => {
    const state = createReadState();
    state.appendAudit({
      at: '2026-01-01T00:00:00.000Z',
      actor: 'wraith',
      type: 'incident.opened',
      payload: {},
    });
    state.listAudit(0, 10)[0]!.payload = { changed: true };
    const response = await createRequestHandler(
      state,
      TOKEN,
    )(
      new Request('http://127.0.0.1:2602/read/audit/verify', {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    );
    expect(await response.json()).toMatchObject({ ok: false, reason: 'hash mismatch' });
  });

  test('a malformed percent-encoded incident id gets 400', async () => {
    const response = await get('/read/incidents/%E0%A4%A', TOKEN);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_id' });
  });
});
