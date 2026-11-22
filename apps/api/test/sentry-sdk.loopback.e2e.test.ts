import * as Sentry from '@sentry/node';
import { afterAll, describe, expect, test } from 'bun:test';

import type { CredentialVerifier, VerifiedCredential } from '../src/auth/auth.types';
import { EVENTS_PUBLISH_SCOPE } from '../src/auth/scopes';
import { buildAuthApp, type AuthTestApp } from './fakes/auth-test-helpers';

const TEST_KEY = 'c'.repeat(64);
const credential: VerifiedCredential = {
  id: 'loopback-credential',
  clientId: 'client-1',
  scopes: [EVENTS_PUBLISH_SCOPE],
  kind: 'plugin',
  service: 'api',
  projectId: '12345',
};
const verifier: CredentialVerifier = {
  async verify(value: string, expectedKind): Promise<VerifiedCredential> {
    if (value !== TEST_KEY || expectedKind !== 'plugin') throw new Error('Invalid test key');
    return credential;
  },
};

describe.skipIf(process.env.CI === 'true')('Sentry SDK loopback ingest', () => {
  let ctx: AuthTestApp | undefined;

  afterAll(async () => {
    await Sentry.close(1000);
    await ctx?.app.close();
  });

  test('sends a real SDK event to the local Nest app', async () => {
    ctx = await buildAuthApp({}, undefined, verifier);
    const server = await ctx.app.listen(0, '127.0.0.1');
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Loopback did not bind');

    Sentry.init({
      dsn: `http://${TEST_KEY}@127.0.0.1:${address.port}/12345`,
      defaultIntegrations: false,
      tracesSampleRate: 0,
    });
    Sentry.captureEvent({
      event_id: 'fedcba9876543210fedcba9876543210',
      message: 'Local Sentry event',
      level: 'error',
      timestamp: 1_795_255_200,
    });

    expect(await Sentry.flush(3000)).toBe(true);
    expect(ctx.publisher.envelopes).toHaveLength(1);
    expect(ctx.publisher.envelopes[0]).toMatchObject({
      id: 'fedcba9876543210fedcba9876543210',
      projectId: '12345',
      service: 'api',
      severity: 'critical',
      payload: { message: 'Local Sentry event' },
    });
  });
});
