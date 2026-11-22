import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { EventEnvelopeSchema } from '@graveshift/core';
import request from 'supertest';

import type { CredentialVerifier, VerifiedCredential } from '../src/auth/auth.types';
import { EVENTS_PUBLISH_SCOPE } from '../src/auth/scopes';
import { readFile } from 'node:fs/promises';
import { buildAuthApp, type AuthTestApp } from './fakes/auth-test-helpers';

const TEST_KEY = 'a'.repeat(64);
const TEST_CREDENTIAL: VerifiedCredential = {
  id: 'sentry-credential',
  clientId: 'client-1',
  scopes: [EVENTS_PUBLISH_SCOPE],
  kind: 'plugin',
  service: 'api',
  projectId: '12345',
  expiresAt: null,
};
const verifier: CredentialVerifier = {
  async verify(value: string, expectedKind): Promise<VerifiedCredential> {
    if (value !== TEST_KEY || expectedKind !== 'plugin') throw new ForbiddenException();
    return TEST_CREDENTIAL;
  },
};
const fixture = await readFile(new URL('./fixtures/sentry-event.envelope', import.meta.url));
const sessionFixture = await readFile(
  new URL('./fixtures/sentry-session.envelope', import.meta.url),
);

describe('POST /api/:projectId/envelope (e2e)', () => {
  let ctx!: AuthTestApp;
  let app!: INestApplication;

  beforeAll(async () => {
    ctx = await buildAuthApp({}, undefined, verifier);
    app = ctx.app;
  });

  afterAll(async () => {
    await app.close();
  });

  function push(projectId = '12345', body: Buffer = fixture) {
    return request(app.getHttpServer())
      .post(`/api/${projectId}/envelope/`)
      .query({ sentry_key: TEST_KEY })
      .set('content-type', 'application/x-sentry-envelope')
      .send(body);
  }

  test('maps one event to a redacted EventEnvelope and skips other items', async () => {
    const response = await push().expect(200);
    expect(response.body).toEqual({ id: '0123456789abcdef0123456789abcdef' });
    expect(ctx.publisher.envelopes).toHaveLength(1);
    expect(EventEnvelopeSchema.safeParse(ctx.publisher.envelopes[0]).success).toBe(true);
    expect(ctx.publisher.envelopes[0]).toMatchObject({
      id: '0123456789abcdef0123456789abcdef',
      projectId: '12345',
      source: 'sentry',
      service: 'api',
      type: 'sentry.TypeError',
      severity: 'warning',
      observedAt: '2026-11-21T10:00:00.000Z',
      traceId: 'abcdef0123456789abcdef0123456789',
      fingerprint: 'stable:error',
    });
    expect(ctx.publisher.envelopes[0]?.payload.message).not.toContain('alice@example.com');
    expect(ctx.publisher.envelopes[0]?.payload.request).toMatchObject({ method: 'GET' });
    // prepareEnvelope drops sensitive payload keys (the base contract), so the
    // authorization header key and its value never reach the published envelope.
    expect(
      (ctx.publisher.envelopes[0]?.payload.request as { headers?: unknown } | undefined)?.headers,
    ).toEqual({});
    const requestJson = JSON.stringify(ctx.publisher.envelopes[0]?.payload.request ?? {});
    expect(requestJson).not.toContain('secret');
    expect(requestJson).not.toContain('authorization');
    expect(requestJson).not.toContain('Bearer');
  });

  test('accepts an envelope with only skipped items and publishes nothing', async () => {
    const publishedBefore = ctx.publisher.envelopes.length;
    await push('12345', sessionFixture).expect(200);
    expect(ctx.publisher.envelopes).toHaveLength(publishedBefore);
  });

  test('accepts an envelope sent as text/plain', async () => {
    const publishedBefore = ctx.publisher.envelopes.length;
    await request(app.getHttpServer())
      .post('/api/12345/envelope/')
      .query({ sentry_key: TEST_KEY })
      .set('content-type', 'text/plain')
      .send(fixture)
      .expect(200);
    expect(ctx.publisher.envelopes).toHaveLength(publishedBefore + 1);
  });

  test('accepts an envelope with no content-type header', async () => {
    const publishedBefore = ctx.publisher.envelopes.length;
    await request(app.getHttpServer())
      .post('/api/12345/envelope/')
      .query({ sentry_key: TEST_KEY })
      .unset('content-type')
      .send(fixture)
      .expect(200);
    expect(ctx.publisher.envelopes).toHaveLength(publishedBefore + 1);
  });

  test('rejects an invalid key and a project id bound to another Credential', async () => {
    await request(app.getHttpServer())
      .post('/api/12345/envelope/')
      .query({ sentry_key: 'b'.repeat(64) })
      .set('content-type', 'application/x-sentry-envelope')
      .send(fixture)
      .expect(403);
    await push('54321').expect(403);
  });

  test('rejects a non-numeric project id in the path with 422 and publishes nothing', async () => {
    // The guard runs first. A Credential with an equal non-numeric projectId passes it,
    // so the path DTO is the check that refuses the request.
    const loose: CredentialVerifier = {
      async verify(): Promise<VerifiedCredential> {
        return { ...TEST_CREDENTIAL, projectId: 'acme' };
      },
    };
    const looseCtx = await buildAuthApp({}, undefined, loose);
    await request(looseCtx.app.getHttpServer())
      .post('/api/acme/envelope/')
      .query({ sentry_key: TEST_KEY })
      .set('content-type', 'application/x-sentry-envelope')
      .send(fixture)
      .expect(422);
    expect(looseCtx.publisher.envelopes).toHaveLength(0);
    await looseCtx.app.close();
  });

  test('rejects a missing key and a key without a Grave binding', async () => {
    const noDsn = Buffer.from(
      fixture.toString('utf8').replace(`,"dsn":"https://${TEST_KEY}@ingest.invalid/12345"`, ''),
    );
    await request(app.getHttpServer())
      .post('/api/12345/envelope/')
      .set('content-type', 'application/x-sentry-envelope')
      .send(noDsn)
      .expect(403);

    const unbound: CredentialVerifier = {
      async verify(): Promise<VerifiedCredential> {
        return { ...TEST_CREDENTIAL, service: null };
      },
    };
    const withoutGrave = await buildAuthApp({}, undefined, unbound);
    try {
      await request(withoutGrave.app.getHttpServer())
        .post('/api/12345/envelope/')
        .query({ sentry_key: TEST_KEY })
        .set('content-type', 'application/x-sentry-envelope')
        .send(fixture)
        .expect(403);
    } finally {
      await withoutGrave.app.close();
    }
  });

  test('does not use event fields to choose the project or Grave', async () => {
    const forged = Buffer.from(
      fixture
        .toString('utf8')
        .replace(
          '"level":"warning"',
          '"projectId":"project-2","service":"worker","level":"warning"',
        ),
    );
    await push('12345', forged).expect(200);
    const published = ctx.publisher.envelopes.at(-1);
    expect(published?.projectId).toBe('12345');
    expect(published?.service).toBe('api');
  });

  test('rejects mismatched authentication sources', async () => {
    await request(app.getHttpServer())
      .post('/api/12345/envelope/')
      .query({ sentry_key: TEST_KEY })
      .set('authorization', `Sentry ${'b'.repeat(64)}`)
      .set('content-type', 'application/x-sentry-envelope')
      .send(fixture)
      .expect(403);
  });

  test('accepts the key from Authorization and from the envelope DSN header', async () => {
    const authEnvelope = Buffer.from(
      fixture
        .toString('utf8')
        .replace(`,"dsn":"https://${'a'.repeat(64)}@ingest.invalid/12345"`, ''),
    );
    const dsnEnvelope = Buffer.from(fixture.toString('utf8').replace('a'.repeat(64), TEST_KEY));
    await request(app.getHttpServer())
      .post('/api/12345/envelope/')
      .set('authorization', `Sentry ${TEST_KEY}`)
      .set('content-type', 'application/x-sentry-envelope')
      .send(authEnvelope)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/12345/envelope/')
      .set('content-type', 'application/x-sentry-envelope')
      .send(dsnEnvelope)
      .expect(200);
  });

  test('returns 422 for malformed envelopes and 413 for oversized bodies', async () => {
    await push('12345', Buffer.from('{broken')).expect(422);
    await push('12345', Buffer.alloc(1_048_577)).expect(413);
  });

  test('does not echo a credential-shaped event id when it skips an item', async () => {
    const publishedBefore = ctx.publisher.envelopes.length;
    const body = Buffer.from(`{"event_id":"${TEST_KEY}"}\n{"type":"session"}\n{}\n`);
    const response = await push('12345', body).expect(200);
    expect(response.body.id).not.toBe(TEST_KEY);
    expect(ctx.publisher.envelopes).toHaveLength(publishedBefore);
  });

  test('returns Retry-After when the Sentry key reaches its rate limit', async () => {
    const limited = await buildAuthApp({ eventRateLimit: 1 }, undefined, verifier);
    try {
      const send = () =>
        request(limited.app.getHttpServer())
          .post('/api/12345/envelope/')
          .query({ sentry_key: TEST_KEY })
          .set('content-type', 'application/x-sentry-envelope')
          .send(fixture);
      await send().expect(200);
      const response = await send().expect(429);
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await limited.app.close();
    }
  });
});
