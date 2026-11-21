import * as Sentry from '@sentry/node';
import { createTransport, parseEnvelope } from '@sentry/core';
import { afterEach, describe, expect, test } from 'bun:test';

describe('official Sentry SDK transport', () => {
  afterEach(async () => {
    await Sentry.close(1000);
  });

  test('serializes an event envelope that the SDK flushes through the transport hook', async () => {
    let received: ReturnType<typeof parseEnvelope> | undefined;
    let sdkEvent: Sentry.Event | undefined;
    Sentry.init({
      dsn: `https://${'a'.repeat(64)}@ingest.invalid/12345`,
      defaultIntegrations: false,
      tracesSampleRate: 0,
      beforeSend(event) {
        sdkEvent = event;
        return event;
      },
      transport: (options) =>
        createTransport(options, async ({ body }) => {
          received = parseEnvelope(body);
          return {
            statusCode: 200,
            headers: { 'x-sentry-rate-limits': null, 'retry-after': null },
          };
        }),
    });

    Sentry.captureEvent({
      event_id: 'abcdef0123456789abcdef0123456789',
      message: 'SDK transport event',
      level: 'error',
      timestamp: 1_795_255_200,
    });
    expect(await Sentry.flush(2000)).toBe(true);
    expect(received?.[0].event_id).toBe('abcdef0123456789abcdef0123456789');
    expect(received?.[0]).toMatchObject({ sent_at: expect.any(String), sdk: expect.any(Object) });
    expect(received?.[1]).toHaveLength(1);
    expect(received?.[1][0]?.[0].type).toBe('event');
    expect(received?.[1][0]?.[1]).toEqual(sdkEvent);
    expect(received?.[1][0]?.[1]).toMatchObject({
      event_id: 'abcdef0123456789abcdef0123456789',
      message: 'SDK transport event',
      level: 'error',
      timestamp: 1_795_255_200,
    });
  });
});
