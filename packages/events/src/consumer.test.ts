import { type EventEnvelope } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import {
  createEventsConsumer,
  deadLetterMessage,
  decodeQueuedEvent,
  natsEventsTransport,
  processQueued,
  type EventMessages,
  type EventsTransport,
  type QueuedEvent,
} from './consumer';
import {
  DETECTION_FILTER_SUBJECT,
  deadLetterSubject,
  EVENTS_SUBJECT_FILTER,
  publishSubject,
} from './subject';
import {
  createEnvelopeDeduplicator,
  DETECTION_CONSUMER,
  GRAVESHIFT_EVENTS_STREAM,
} from './streams';

const envelope: EventEnvelope = {
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

function message(value: unknown = envelope, subject = publishSubject(envelope)) {
  const calls: string[] = [];
  const queued: QueuedEvent = {
    data: new TextEncoder().encode(JSON.stringify(value)),
    subject,
    term: (reason) => calls.push(`term:${reason}`),
    working: () => calls.push('working'),
    nak: () => calls.push('nak'),
    ackAck: async () => {
      calls.push('ack');
      return true;
    },
  };
  return { calls, queued };
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

function transport(
  items: QueuedEvent[],
  deadLettered: Array<{ subject: string; envelope: unknown }>,
) {
  let acquired = 0;
  let closed = 0;
  const api = {
    get acquired() {
      return acquired;
    },
    get closed() {
      return closed;
    },
  };
  const value: EventsTransport = {
    async acquire() {
      acquired++;
      return {
        messages: messages(items),
        publisher: {
          async publish() {
            throw new Error('Collectors do not publish in this test');
          },
        },
        deadLetter: async (event) => {
          deadLettered.push({
            subject: deadLetterSubject(event.projectId, event.service),
            envelope: event,
          });
        },
        close: async () => {
          closed++;
        },
      };
    },
  };
  return { api, value };
}

describe('the Events process port', () => {
  test('decodes only a whole Event on its own subject', () => {
    expect(decodeQueuedEvent(message().queued.data, publishSubject(envelope))).toMatchObject({
      id: envelope.id,
    });
    expect(
      decodeQueuedEvent(message().queued.data, 'graveshift.project-1.detection.other.signal.oom'),
    ).toBeNull();
    expect(decodeQueuedEvent(new TextEncoder().encode('{'), publishSubject(envelope))).toBeNull();
    expect(
      decodeQueuedEvent(
        new Uint8Array(GRAVESHIFT_EVENTS_STREAM.max_msg_size + 1),
        publishSubject(envelope),
      ),
    ).toBeNull();
  });

  test('acknowledges only after the process port finishes its durable writes', async () => {
    const queued = message();
    const entered = Promise.withResolvers<void>();
    const finished = Promise.withResolvers<void>();
    const delivery = processQueued(
      queued.queued,
      async () => {
        entered.resolve();
        await finished.promise;
      },
      { grantedProjectIds: ['project-1'] },
    );
    await entered.promise;
    expect(queued.calls).toEqual([]);
    finished.resolve();
    await delivery;
    expect(queued.calls).toEqual(['ack']);
  });

  test('requests redelivery after a failed write or lost acknowledgement', async () => {
    const failed = message();
    await processQueued(
      failed.queued,
      async () => {
        throw new Error('Storage unavailable');
      },
      { grantedProjectIds: ['project-1'] },
    );
    expect(failed.calls).toEqual(['nak']);

    const lost = message();
    lost.queued.ackAck = async () => {
      lost.calls.push('ack');
      return false;
    };
    await processQueued(lost.queued, async () => {}, { grantedProjectIds: ['project-1'] });
    expect(lost.calls).toEqual(['ack', 'nak']);
  });

  test('terminates an invalid payload without dispatch', async () => {
    const queued = message(null);
    let dispatched = false;
    await processQueued(
      queued.queued,
      async () => {
        dispatched = true;
      },
      { grantedProjectIds: ['project-1'] },
    );
    expect(dispatched).toBe(false);
    expect(queued.calls[0]).toStartWith('term:');
  });

  test('dead-letters an Event whose Project is not granted and never dispatches it', async () => {
    const queued = message();
    const deadLettered: Array<{ subject: string; envelope: unknown }> = [];
    let dispatched = false;
    await processQueued(
      queued.queued,
      async () => {
        dispatched = true;
      },
      {
        grantedProjectIds: ['project-2'],
        deadLetter: async (event) => {
          deadLettered.push({
            subject: deadLetterSubject(event.projectId, event.service),
            envelope: event,
          });
        },
      },
    );
    expect(dispatched).toBe(false);
    expect(deadLettered).toEqual([
      { subject: deadLetterSubject(envelope.projectId, envelope.service), envelope },
    ]);
    expect(queued.calls).toEqual([`term:Project is not granted`]);
  });

  test('the dead-letter body keeps the refusal reason', () => {
    const body = JSON.parse(
      new TextDecoder().decode(deadLetterMessage(envelope, 'Project is not granted')),
    );
    expect(body.id).toBe(envelope.id);
    expect(body.deadLetterReason).toBe('Project is not granted');
  });

  test('requests redelivery when a dead-letter write fails', async () => {
    const queued = message();
    await processQueued(queued.queued, async () => {}, {
      grantedProjectIds: [],
      deadLetter: async () => {
        throw new Error('Broker unavailable');
      },
    });
    expect(queued.calls).toEqual(['nak']);
  });

  test('acknowledges a repeated envelope without a second dispatch', async () => {
    const dedupe = createEnvelopeDeduplicator();
    const first = message();
    await processQueued(first.queued, async () => {}, {
      grantedProjectIds: ['project-1'],
      dedupe,
    });
    const repeated = message();
    let dispatched = false;
    await processQueued(
      repeated.queued,
      async () => {
        dispatched = true;
      },
      { grantedProjectIds: ['project-1'], dedupe },
    );
    expect(dispatched).toBe(false);
    expect(repeated.calls).toEqual(['ack']);
  });
});

describe('the one Events consumer adapter', () => {
  test('binds the declared consumer without calling any management API', async () => {
    const calls: string[] = [];
    const deny = (name: string) => () => {
      calls.push(name);
      throw new Error(`permissions violation: ${name}`);
    };
    const client = {
      jetstreamManager: deny('jetstreamManager'),
      consumers: {
        info: deny('consumers.info'),
        add: deny('consumers.add'),
        get: async (stream: string, durable: string) => {
          calls.push(`consumers.get:${stream}:${durable}`);
          return { consume: async () => messages([]) };
        },
      },
      publish: async () => {},
    };
    const natsTransport = natsEventsTransport('nats://127.0.0.1:4222', async () => ({
      client: client as never,
      close: async () => {},
      drain: async () => {},
    }));
    const handle = await natsTransport.acquire();
    expect(handle).toBeDefined();
    expect(calls).toEqual([
      `consumers.get:${GRAVESHIFT_EVENTS_STREAM.name}:${DETECTION_CONSUMER.durable_name}`,
    ]);
    await handle.close();
  });

  test('acquires once, carries decoded Events through the process port, and closes on stop', async () => {
    const deadLettered: Array<{ subject: string; envelope: unknown }> = [];
    const fake = transport([message().queued], deadLettered);
    const consumer = await createEventsConsumer({
      transport: fake.value,
      grantedProjectIds: ['project-1'],
    });
    expect(fake.api.acquired).toBe(1);
    const seen: EventEnvelope[] = [];
    await consumer.run(async (event) => {
      seen.push(event);
    });
    expect(seen).toMatchObject([{ id: envelope.id, projectId: 'project-1' }]);
    expect(deadLettered).toEqual([]);
    await consumer.stop();
    expect(fake.api.closed).toBe(1);
    expect(() => consumer.run(async () => {})).toThrow('already running');
  });

  test('both declarative configs stay derived from the one subject definition', () => {
    expect(GRAVESHIFT_EVENTS_STREAM.subjects).toEqual([EVENTS_SUBJECT_FILTER]);
    expect(DETECTION_CONSUMER.filter_subject).toBe(DETECTION_FILTER_SUBJECT);
  });
});
