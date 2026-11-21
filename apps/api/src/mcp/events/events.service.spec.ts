import { describe, expect, test } from 'bun:test';

import { validEnvelope } from '../../../test/fakes/auth-test-helpers';
import { EventPollService, type EventPollResult, type PollParams } from './events.service';
import { InMemoryEventSource } from './events.source';

const scopes = ['incidents:read'];

function setup() {
  const source = new InMemoryEventSource();
  return { source, service: new EventPollService(source) };
}

async function poll(service: EventPollService, params: PollParams): Promise<EventPollResult> {
  return service.poll(params, scopes) as Promise<EventPollResult>;
}

describe('EventPollService', () => {
  test('lists six event types with schemas', () => {
    const { service } = setup();
    const result = service.list();
    expect(result.events).toHaveLength(6);
    for (const type of result.events) {
      expect(type.inputSchema).toMatchObject({ type: 'object' });
      expect(type.payloadSchema).toMatchObject({ type: 'object' });
      expect(type.delivery).toEqual(['poll']);
    }
  });

  test('caps a page, sets hasMore and resumes from the returned cursor', async () => {
    const { source, service } = setup();
    source.push(validEnvelope({ id: 'a', type: 'signal.oom' }));
    source.push(validEnvelope({ id: 'b', type: 'signal.oom' }));
    const first = await poll(service, {
      name: 'incident.changed',
      cursor: 'c2VxOjA=',
      maxEvents: 1,
    });
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

  test('deduplicates by eventId within one poll', async () => {
    const { source, service } = setup();
    source.push(validEnvelope({ id: 'same', type: 'signal.oom' }));
    source.push(validEnvelope({ id: 'same', type: 'signal.oom' }));
    const result = await poll(service, { name: 'incident.changed', cursor: 'c2VxOjA=' });
    expect(result.events).toHaveLength(1);
  });

  test('marks truncated when maxAgeMs skips old events', async () => {
    const { source, service } = setup();
    source.push(
      validEnvelope({ id: 'old', type: 'signal.oom', observedAt: '2020-01-01T00:00:00.000Z' }),
    );
    const result = await poll(service, {
      name: 'incident.changed',
      cursor: 'c2VxOjA=',
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
      cursor: 'c2VxOjA=',
      arguments: { service: 'worker' },
    });
    expect(result.events.map((event) => event.eventId)).toEqual(['worker']);
  });

  test('rejects a malformed cursor', async () => {
    const { service } = setup();
    const error = await poll(service, { name: 'incident.changed', cursor: 'not-a-cursor' }).catch(
      (reason: unknown) => reason,
    );
    expect((error as { code: number }).code).toBe(-32602);
  });
});
