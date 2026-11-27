import type { EventEnvelope } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import {
  createEventsConsumer,
  type EventMessages,
  type EventsTransport,
  type QueuedEvent,
} from './consumer';
import { publishSubject } from './subject';

const base: EventEnvelope = {
  id: 'evt-1',
  projectId: 'project-1',
  source: 'collector.docker',
  service: 'api',
  type: 'signal.oom',
  severity: 'critical',
  observedAt: '2026-11-20T10:00:00.000Z',
  traceId: 'trace-1',
  fingerprint: 'api:oom',
  payload: { restarts: 3 },
};

function queued(event: EventEnvelope): QueuedEvent {
  return {
    data: new TextEncoder().encode(JSON.stringify(event)),
    subject: publishSubject(event),
    term: () => {},
    working: () => {},
    nak: () => {},
    ackAck: async () => true,
  };
}

function messages(items: QueuedEvent[]): EventMessages {
  let stopped = false;
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        if (stopped) break;
        yield item;
      }
    },
    stop() {
      stopped = true;
    },
  };
}

describe('Events deduplication across Projects', () => {
  test('dispatches one Event id in two Projects without suppression', async () => {
    const other: EventEnvelope = { ...base, projectId: 'project-2' };
    const transport: EventsTransport = {
      async acquire() {
        return {
          messages: messages([queued(base), queued(other)]),
          publisher: { publish: async () => {} },
          deadLetter: async () => {},
          close: async () => {},
        };
      },
    };
    const consumer = await createEventsConsumer({
      transport,
      grantedProjectIds: ['project-1', 'project-2'],
    });
    const seen: EventEnvelope[] = [];
    await consumer.run(async (event) => {
      seen.push(event);
    });
    expect(seen.map((event) => `${event.projectId}:${event.id}`)).toEqual([
      'project-1:evt-1',
      'project-2:evt-1',
    ]);
    await consumer.stop();
  });
});
