import { describe, expect, test } from 'bun:test';

import { handleRequest } from './routes';

describe('health route', () => {
  test('GET /healthz returns ok without caching', async () => {
    const response = handleRequest(new Request('http://localhost:2602/healthz'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('non-GET /healthz returns 405', () => {
    const response = handleRequest(
      new Request('http://localhost:2602/healthz', { method: 'POST' }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });

  test('unknown path returns 404 with a content type', () => {
    const response = handleRequest(new Request('http://localhost:2602/nope'));
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  });
});
