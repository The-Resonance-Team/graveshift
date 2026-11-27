import { describe, expect, test } from 'bun:test';

import { validEnvelope } from '../../../test/fakes/auth-test-helpers';
import { EventPollService } from './events.service';
import { InMemoryEventSource } from './events.source';
import { EVENT_TYPES } from './events.types';

const START = Buffer.from('seq:0').toString('base64url');
const ID = 'c3b478e1-4fa8-4988-b3e6-572bd46d8c21';

describe('Event type behavior through polling', () => {
  test.each(EVENT_TYPES)(
    '$name preserves identity and returns only declared payload fields',
    async (type) => {
      const source = new InMemoryEventSource();
      const service = new EventPollService(source);
      source.push(
        validEnvelope({
          id: ID,
          type: type.name,
          severity: 'critical',
          payload: {
            rootCause: 'contact alice@example.com',
            confidence: 0.7,
            message: 'Bearer abcdefgh1234',
            seq: 3,
            kind: 'policy',
            summary: 'alice@example.com',
            name: 'latency',
            value: 12,
            action: 'open_pr',
            decision: 'allow',
            hidden: 'must not escape',
          },
        }),
      );
      const response = await service.poll(
        {
          name: type.name,
          cursor: START,
          arguments: { service: 'api', severity: 'critical' },
        },
        [type.scope],
      );
      expect(response.events).toHaveLength(1);
      const event = response.events[0]!;
      expect(event.eventId).toBe(ID);
      expect(event.name).toBe(type.name);
      expect(JSON.stringify(event)).not.toContain('alice@example.com');
      expect(JSON.stringify(event)).not.toContain('abcdefgh1234');
      expect(event.data).not.toHaveProperty('hidden');
      const properties = type.payloadSchema.properties;
      if (typeof properties !== 'object' || properties === null)
        throw new Error('Missing payload schema');
      expect(Object.keys(event.data).sort()).toEqual(Object.keys(properties).sort());
      const filtered = await service.poll(
        {
          name: type.name,
          cursor: START,
          arguments: { severity: 'warning' },
        },
        [type.scope],
      );
      expect(filtered.events).toEqual([]);
    },
  );

  test('keeps malformed payload defaults and rejects arguments outside the catalog schema', async () => {
    const source = new InMemoryEventSource();
    const service = new EventPollService(source);
    source.push(
      validEnvelope({
        id: ID,
        type: 'diagnosis.ready',
        payload: { rootCause: 42, confidence: 'bad' },
      }),
    );
    const response = await service.poll({ name: 'diagnosis.ready', cursor: START }, [
      'diagnoses:read',
    ]);
    expect(response.events[0]?.data).toEqual({ incidentId: ID, rootCause: '', confidence: 0 });
    await expect(
      service.poll(
        {
          name: 'diagnosis.ready',
          cursor: START,
          arguments: { unknown: 'value' },
        },
        ['diagnoses:read'],
      ),
    ).rejects.toMatchObject({ code: -32602 });
  });
});
