import { describe, expect, test } from 'bun:test';
import type { EventEnvelope } from '@graveshift/core';

import type { VerifiedCredential } from './auth.types';
import { mapSentryEvent } from './sentry-event.mapper';

const credential: VerifiedCredential = {
  id: 'credential-1',
  clientId: 'client-1',
  tenantId: 'tenant-1',
  scopes: ['events:publish'],
  kind: 'plugin',
  service: 'api',
  projectId: '12345',
};

describe('mapSentryEvent', () => {
  test('maps each Sentry severity to the canonical split', () => {
    const expected = new Map<string, EventEnvelope['severity']>([
      ['fatal', 'critical'],
      ['error', 'critical'],
      ['warning', 'warning'],
      ['info', 'info'],
      ['debug', 'info'],
    ]);

    for (const [level, severity] of expected) {
      const envelope = mapSentryEvent(
        { level, timestamp: 1, message: 'test' },
        { event_id: '0123456789abcdef0123456789abcdef' },
        credential,
        'fallback',
      );
      expect(envelope.severity).toBe(severity);
    }
  });

  test('uses the stable type, culprit and message fallback for a fingerprint', () => {
    const envelope = mapSentryEvent(
      {
        timestamp: 1,
        culprit: 'api.handler',
        message: 'failed',
        exception: { values: [{ type: 'TypeError' }] },
      },
      {},
      credential,
      '0123456789abcdef0123456789abcdef',
    );

    expect(envelope.id).toBe('0123456789abcdef0123456789abcdef');
    expect(envelope.type).toBe('sentry.TypeError');
    expect(envelope.fingerprint).toBe('sentry.TypeError:api.handler:failed');
    expect(envelope.traceId).toBe('0123456789abcdef0123456789abcdef');
  });

  test('redacts a secret-shaped exception type before it becomes the event type', () => {
    const secret = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890';
    const envelope = mapSentryEvent(
      {
        timestamp: 1,
        exception: { values: [{ type: secret }] },
      },
      {},
      credential,
      '0123456789abcdef0123456789abcdef',
    );

    expect(envelope.type).not.toContain(secret);
    expect(envelope.type).toContain('REDACTED');
    expect(envelope.fingerprint).not.toContain(secret);
  });

  test('uses sent_at or ingestion time when the event has no timestamp', () => {
    const id = '0123456789abcdef0123456789abcdef';
    const sentAt = '2026-11-20T10:00:00.000Z';
    const withSentAt = mapSentryEvent(
      { message: 'no timestamp' },
      { sent_at: sentAt },
      credential,
      id,
    );
    expect(withSentAt.observedAt).toBe(sentAt);

    const withIngestionTime = mapSentryEvent(
      { message: 'no timestamp' },
      {},
      credential,
      id,
      '2026-11-21T10:00:00.000Z',
    );
    expect(withIngestionTime.observedAt).toBe('2026-11-21T10:00:00.000Z');
  });
});
