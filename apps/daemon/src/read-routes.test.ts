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
    state.setCounters({
      openPrsLastHour: 3,
      actionsLast10Min: 0,
      diagnosisLoops: 0,
      llmSpentTodayUsd: 0,
    });
    const request = createRequestHandler(state, TOKEN);
    const counters = await request(
      new Request('http://127.0.0.1:2602/read/counters', {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    );
    expect(await counters.json()).toMatchObject({ openPrsLastHour: 3 });
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
});
