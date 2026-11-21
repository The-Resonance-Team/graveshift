import type { EventEnvelope } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import { createHttpPublisher } from './http';

const envelope: EventEnvelope = {
  id: 'evt-1',
  tenantId: 'tenant-1',
  source: 'plugin.nestjs',
  service: 'api',
  type: 'signal.oom',
  severity: 'info',
  observedAt: '2026-11-20T10:00:00.000Z',
  traceId: 'trace-1',
  fingerprint: 'api:oom',
  payload: { restarts: 3 },
};

describe('createHttpPublisher', () => {
  test('posts an envelope with a bearer key and accepts 202', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const stubFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(null, { status: 202 });
    }) as typeof fetch;

    await createHttpPublisher({
      baseUrl: 'http://127.0.0.1:3000/',
      apiKey: 'key-1',
      fetch: stubFetch,
    }).publish(envelope);

    expect(seen?.url).toBe('http://127.0.0.1:3000/api/events');
    expect(seen?.init.method).toBe('POST');
    const headers = seen?.init.headers as Record<string, string>;
    expect(headers?.authorization).toBe('Bearer key-1');
    expect(JSON.parse(String(seen?.init.body))).toEqual(envelope);
  });

  test('throws when the API rejects the envelope', async () => {
    // Test stub: the publisher calls only the fetch signature.
    const stubFetch = (async () => new Response(null, { status: 422 })) as unknown as typeof fetch;
    const publisher = createHttpPublisher({
      baseUrl: 'http://127.0.0.1:3000',
      apiKey: 'key-1',
      fetch: stubFetch,
    });
    expect(publisher.publish(envelope)).rejects.toThrow('status 422');
  });
});
