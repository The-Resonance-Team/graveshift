import { describe, expect, test } from 'bun:test';

import { handleRequest } from './routes';

describe('health route', () => {
  test('GET /healthz returns ok', async () => {
    const response = await handleRequest(new Request('http://localhost:2602/healthz'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('unknown path returns 404', () => {
    const response = handleRequest(new Request('http://localhost:2602/nope'));
    expect(response.status).toBe(404);
  });
});
