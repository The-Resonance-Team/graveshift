import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { validEnvelope } from '../../../test/fakes/auth-test-helpers';
import { EventPollService, type EventPollResult, type PollParams } from './events.service';
import { InMemoryEventSource } from './events.source';
import { EVENT_TYPES } from './events.types';

const scopes = ['incidents:read'];
const START = 'c2VxOjA=';

function setup() {
  const source = new InMemoryEventSource();
  return { source, service: new EventPollService(source) };
}

async function poll(service: EventPollService, params: PollParams): Promise<EventPollResult> {
  return service.poll(params, scopes, 'tenant-1');
}

function errorCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code: unknown }).code;
  return typeof code === 'number' ? code : undefined;
}

describe('EventPollService', () => {
  test('lists six event types with schemas', () => {
    const { service } = setup();
    const result = service.list();
    expect(result.events).toHaveLength(6);
    for (const type of result.events) {
      expect(type.inputSchema).toMatchObject({ type: 'object' });
      expect(type.payloadSchema).toMatchObject({ additionalProperties: false });
      expect(type.delivery).toEqual(['poll']);
    }
  });

  test('caps a page, sets hasMore and resumes from the returned cursor', async () => {
    const { source, service } = setup();
    source.push(validEnvelope({ id: 'a', type: 'signal.oom' }));
    source.push(validEnvelope({ id: 'b', type: 'signal.oom' }));
    const first = await poll(service, { name: 'incident.changed', cursor: START, maxEvents: 1 });
    expect(first.events.map((event) => event.eventId)).toEqual(['a']);
    expect(first.hasMore).toBe(true);
    const second = await poll(service, {
      name: 'incident.changed',
      cursor: first.cursor,
      maxEvents: 1,
    });
    expect(second.events.map((event) => event.eventId)).toEqual(['b']);
    expect(second.hasMore).toBe(false);
  });

  test('does not skip a match after 250 non-matching entries fill many windows', async () => {
    const { source, service } = setup();
    for (let index = 0; index < 250; index++) {
      source.push(validEnvelope({ id: `skip-${index}`, type: 'log.entry' }));
    }
    source.push(validEnvelope({ id: 'found', type: 'signal.oom' }));
    const result = await poll(service, { name: 'incident.changed', cursor: START });
    expect(result.events.map((event) => event.eventId)).toEqual(['found']);
    expect(result.hasMore).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.cursor).toBe(Buffer.from('seq:251', 'utf8').toString('base64url'));
  });

  test('resumes across sparse matches with a small scan window', async () => {
    const { source, service } = setup();
    service.windowSize = 3;
    const expected: string[] = [];
    for (let seq = 1; seq <= 450; seq++) {
      const isMatch = seq % 97 === 0;
      const id = isMatch ? `match-${seq}` : `skip-${seq}`;
      source.push(validEnvelope({ id, type: isMatch ? 'signal.oom' : 'log.entry' }));
      if (isMatch) expected.push(id);
    }

    const received: string[] = [];
    const collect = async (cursor: string, stepsLeft: number): Promise<void> => {
      if (stepsLeft < 0) return;
      const result = await poll(service, { name: 'incident.changed', cursor, maxEvents: 2 });
      received.push(...result.events.map((event) => event.eventId));
      if (!result.hasMore) return;
      return collect(result.cursor, stepsLeft - 1);
    };
    await collect(START, 20);
    expect(received).toEqual(expected);
  });

  test('deduplicates by eventId within one poll', async () => {
    const { source, service } = setup();
    source.push(validEnvelope({ id: 'same', type: 'signal.oom' }));
    source.push(validEnvelope({ id: 'same', type: 'signal.oom' }));
    const result = await poll(service, { name: 'incident.changed', cursor: START });
    expect(result.events).toHaveLength(1);
  });

  test('returns only fields that the advertised payloadSchema declares', async () => {
    const { source, service } = setup();
    source.push(
      validEnvelope({
        id: 'shape',
        type: 'signal.oom',
        payload: { restarts: 3, note: 'do not leak' },
      }),
    );
    const result = await poll(service, { name: 'incident.changed', cursor: START });
    const keys = Object.keys(result.events[0]!.data).sort();
    expect(keys).toEqual(['incidentId', 'service', 'severity', 'state']);
    expect(result.events[0]!.data.service).toBe('api');
  });

  test('marks truncated when maxAgeMs skips old events', async () => {
    const { source, service } = setup();
    source.push(
      validEnvelope({ id: 'old', type: 'signal.oom', observedAt: '2020-01-01T00:00:00.000Z' }),
    );
    const result = await poll(service, {
      name: 'incident.changed',
      cursor: START,
      maxAgeMs: 60_000,
    });
    expect(result.events).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  test('filters by the declared input arguments', async () => {
    const { source, service } = setup();
    source.push(validEnvelope({ id: 'api', type: 'signal.oom', service: 'api' }));
    source.push(validEnvelope({ id: 'worker', type: 'signal.oom', service: 'worker' }));
    const result = await poll(service, {
      name: 'incident.changed',
      cursor: START,
      arguments: { service: 'worker' },
    });
    expect(result.events.map((event) => event.eventId)).toEqual(['worker']);
  });

  test('never returns another tenant events from the shared stream', async () => {
    const { source, service } = setup();
    source.push(validEnvelope({ id: 'tenant-1-event', type: 'signal.oom', tenantId: 'tenant-1' }));
    source.push(validEnvelope({ id: 'tenant-2-event', type: 'signal.oom', tenantId: 'tenant-2' }));
    const result = await poll(service, { name: 'incident.changed', cursor: START });
    expect(result.events.map((event) => event.eventId)).toEqual(['tenant-1-event']);
  });

  test('rejects a malformed cursor', async () => {
    const { service } = setup();
    const error = await poll(service, { name: 'incident.changed', cursor: 'not-a-cursor' }).catch(
      (reason: unknown) => reason,
    );
    expect(errorCode(error)).toBe(-32602);
  });

  test('rejects a cursor above the safe integer range', async () => {
    const { service } = setup();
    const cursor = Buffer.from('seq:9007199254740993', 'utf8').toString('base64url');
    const error = await poll(service, { name: 'incident.changed', cursor }).catch(
      (reason: unknown) => reason,
    );
    expect(errorCode(error)).toBe(-32602);
  });

  test('a static catalog declares one scope per event type', () => {
    const scopesByType = EVENT_TYPES.map((type) => type.scope);
    expect(new Set(scopesByType).size).toBe(6);
  });

  test('any interleaving of types resumes without skip or repeat', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.boolean(), { maxLength: 350 }), async (flags) => {
        const { source, service } = setup();
        service.windowSize = 3;
        const expected: string[] = [];
        flags.forEach((isMatch, index) => {
          const id = `evt-${index}`;
          const type = isMatch ? 'signal.oom' : 'log.entry';
          source.push(validEnvelope({ id, type }));
          if (isMatch) expected.push(id);
        });

        const received: string[] = [];
        const collect = async (cursor: string, stepsLeft: number): Promise<void> => {
          if (stepsLeft < 0) return;
          const result = await poll(service, {
            name: 'incident.changed',
            cursor,
            maxEvents: 2,
          });
          received.push(...result.events.map((event) => event.eventId));
          if (!result.hasMore) return;
          return collect(result.cursor, stepsLeft - 1);
        };
        await collect(START, flags.length);
        expect(received).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });
});
