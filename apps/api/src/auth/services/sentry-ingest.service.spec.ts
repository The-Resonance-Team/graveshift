import { EventEnvelopeSchema, type EventEnvelope } from '@graveshift/core';
import { createNatsPublisher } from '@graveshift/events';
import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, test } from 'bun:test';

import type { VerifiedCredential } from '../auth.types';
import { SentryIngestService } from './sentry-ingest.service';

const credential: VerifiedCredential = {
  id: 'sentry-credential',
  clientId: 'client-1',
  scopes: ['events:publish'],
  kind: 'plugin',
  service: 'api',
  projectId: '12345',
  expiresAt: null,
};

function sentryBody(id: string, fingerprint: string): Buffer {
  return Buffer.from(
    [
      JSON.stringify({ event_id: id }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify({
        timestamp: '2026-11-28T10:00:00.000Z',
        fingerprint: [fingerprint],
        message: 'Contact audit@example.test',
        request: { headers: { authorization: 'Bearer synthetic-secret-123' } },
      }),
      '',
    ].join('\n'),
  );
}

function ingestion() {
  const published: EventEnvelope[] = [];
  const publisher = createNatsPublisher({
    async publish(_subject, payload) {
      published.push(EventEnvelopeSchema.parse(JSON.parse(new TextDecoder().decode(payload))));
    },
  });
  return { service: new SentryIngestService(publisher), published };
}

describe('Sentry published Event envelopes', () => {
  test.each(['audit@example.test', 'ghp_abcdefghijklmnopqrstuvwxyz1234567890'])(
    'rejects sensitive fingerprint metadata before publication (%#)',
    async (fingerprint) => {
      const { service, published } = ingestion();
      await expect(
        service.ingest(
          { projectId: '12345' },
          sentryBody('c3b478e1-4fa8-4988-b3e6-572bd46d8c21', fingerprint),
          credential,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(published).toEqual([]);
    },
  );

  test('preserves distinct UUID fingerprints while removing private payload data', async () => {
    const { service, published } = ingestion();
    const ids = ['c3b478e1-4fa8-4988-b3e6-572bd46d8c21', 'a4927f1e-652e-4a10-9ec3-7d857bbaf504'];
    const responses = await Promise.all(
      ids.map((id) => service.ingest({ projectId: '12345' }, sentryBody(id, id), credential)),
    );
    expect(responses.map((response) => response.id)).toEqual(ids);
    expect(published.map((event) => event.fingerprint).sort()).toEqual([...ids].sort());
    for (const event of published) {
      expect(JSON.stringify(event.payload)).not.toContain('audit@example.test');
      expect(JSON.stringify(event.payload)).not.toContain('authorization');
      expect(JSON.stringify(event.payload)).not.toContain('synthetic-secret-123');
    }
  });
});
