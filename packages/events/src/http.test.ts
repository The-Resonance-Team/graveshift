import { EnvelopeError, type EventEnvelope, EventEnvelopeSchema } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import { createHttpPublisher } from './http';

const envelope: EventEnvelope = {
  id: 'evt-1',
  projectId: 'project-1',
  source: 'native',
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
    let seen: Request | undefined;
    let body: unknown;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        seen = request;
        body = await request.json();
        return new Response(null, { status: 202 });
      },
    });
    try {
      await createHttpPublisher({ baseUrl: server.url.href, apiKey: 'key-1' }).publish({
        ...envelope,
        source: 'plugin ops@example.com',
        payload: { password: 'opaque', message: 'ops@example.com' },
      });
      expect(seen?.url).toBe(new URL('/api/events', server.url).href);
      expect(seen?.method).toBe('POST');
      expect(seen?.headers.get('authorization')).toBe('Bearer key-1');
      expect(EventEnvelopeSchema.parse(body)).toEqual({
        ...envelope,
        source: 'plugin [REDACTED:email]',
        payload: { message: '[REDACTED:email]' },
      });
    } finally {
      await server.stop(true);
    }
  });

  test('throws when the API rejects the envelope', async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Response(null, { status: 422 }) });
    try {
      const publisher = createHttpPublisher({ baseUrl: server.url.href, apiKey: 'key-1' });
      await expect(publisher.publish(envelope)).rejects.toThrow('status 422');
    } finally {
      await server.stop(true);
    }
  });

  test('rejects sensitive metadata before making an HTTP request', async () => {
    let requests = 0;
    const server = Bun.serve({
      port: 0,
      fetch() {
        requests++;
        return new Response(null, { status: 202 });
      },
    });
    try {
      const publisher = createHttpPublisher({ baseUrl: server.url.href, apiKey: 'key-1' });
      await expect(publisher.publish({ ...envelope, traceId: 'ops@example.com' })).rejects.toThrow(
        EnvelopeError,
      );
      expect(requests).toBe(0);
    } finally {
      await server.stop(true);
    }
  });
});
