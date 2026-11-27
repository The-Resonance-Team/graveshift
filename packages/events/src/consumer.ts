import { type EventEnvelope, prepareEnvelope } from '@graveshift/core';
import { jetstream, type JetStreamClient } from '@nats-io/jetstream';
import { connect } from '@nats-io/transport-node';

import { createNatsPublisher, type Publisher } from './publisher';
import { deadLetterSubject, publishSubject } from './subject';
import {
  createEnvelopeDeduplicator,
  DETECTION_CONSUMER,
  type EnvelopeDeduplicator,
  GRAVESHIFT_EVENTS_STREAM,
} from './streams';

/** The dead-letter body keeps the Event and the reason it was refused. */
export function deadLetterMessage(envelope: EventEnvelope, reason: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ ...envelope, deadLetterReason: reason }));
}

/** The whole JetStream message surface the process port needs. */
export interface QueuedEvent {
  readonly data: Uint8Array;
  readonly subject: string;
  term(reason?: string): void;
  working(): void;
  nak(delayMs?: number): void;
  ackAck(): Promise<boolean>;
}

export interface EventMessages extends AsyncIterable<QueuedEvent> {
  stop(): void;
}

/** Acquisition is the one deep transport adapter behind the process port. */
export interface EventsTransport {
  acquire(): Promise<{
    messages: EventMessages;
    publisher: Publisher;
    /** Move a rejected Event to its Project's dead-letter subject. */
    deadLetter(envelope: EventEnvelope, reason: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

export interface DeliveryOptions {
  /** A Project outside this set is dead-lettered, never processed. */
  grantedProjectIds: readonly string[];
  deadLetter?: (envelope: EventEnvelope, reason: string) => Promise<void>;
  /** Suppresses completed delivery keys, each one a Project and Event id. */
  dedupe?: EnvelopeDeduplicator;
}

export interface EventsConsumer {
  /** Collectors publish through this, on the same private connection. */
  readonly publisher: Publisher;
  /** The only port the daemon uses: decoded Events in, durable writes done before ack. */
  run(process: (envelope: EventEnvelope) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}

export interface EventsConsumerOptions {
  transport: EventsTransport;
  grantedProjectIds: readonly string[];
}

/** Decode a queued payload only when it is a whole Event on its own subject. */
export function decodeQueuedEvent(data: Uint8Array, subject: string): EventEnvelope | null {
  if (data.byteLength > GRAVESHIFT_EVENTS_STREAM.max_msg_size) return null;
  try {
    const envelope = prepareEnvelope(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)),
    );
    return subject === publishSubject(envelope) ? envelope : null;
  } catch {
    return null;
  }
}

/**
 * Deliver one queued Event. Invalid and ungranted Events never reach the
 * process port; a failed write or lost ack requests redelivery.
 */
export async function processQueued(
  message: QueuedEvent,
  process: (envelope: EventEnvelope) => Promise<void>,
  options: DeliveryOptions,
): Promise<void> {
  const envelope = decodeQueuedEvent(message.data, message.subject);
  if (envelope === null) {
    message.term('Invalid Event envelope');
    return;
  }
  const granted = new Set(options.grantedProjectIds);
  if (!granted.has(envelope.projectId)) {
    if (options.deadLetter === undefined) {
      message.term('Project is not granted');
      return;
    }
    try {
      await options.deadLetter(envelope, 'Project is not granted');
      message.term('Project is not granted');
    } catch {
      message.nak(1000);
    }
    return;
  }
  // A projectId is one NATS token, so it holds no colon and cannot collide here.
  const key = `${envelope.projectId}:${envelope.id}`;
  if (options.dedupe?.has(key) === true) {
    await message.ackAck();
    return;
  }
  const heartbeat = setInterval(() => message.working(), 10_000);
  try {
    await process(envelope);
    if (!(await message.ackAck())) throw new Error('Event acknowledgement failed');
    options.dedupe?.markDone(key);
  } catch {
    message.nak(1000);
  } finally {
    clearInterval(heartbeat);
  }
}

/** One deep adapter: it owns acquisition, decoding, dedup, dead-letter and ack. */
export async function createEventsConsumer(
  options: EventsConsumerOptions,
): Promise<EventsConsumer> {
  const { messages, publisher, deadLetter, close } = await options.transport.acquire();
  const dedupe = createEnvelopeDeduplicator();
  const delivery: DeliveryOptions = {
    grantedProjectIds: options.grantedProjectIds,
    deadLetter,
    dedupe,
  };
  let stopping = false;
  let running: Promise<void> | undefined;
  return {
    publisher,
    run(process) {
      if (running !== undefined) throw new Error('Event consumer is already running');
      running = (async () => {
        for await (const message of messages) {
          if (stopping) break;
          await processQueued(message, process, delivery);
        }
      })();
      return running;
    },
    async stop() {
      stopping = true;
      messages.stop();
      try {
        await running;
      } finally {
        await close();
      }
    },
  };
}

/** The JetStream session the transport binds to. Injected in tests. */
export interface NatsSession {
  client: JetStreamClient;
  close(): Promise<void>;
  drain(): Promise<void>;
}

export async function openNatsSession(servers: string | string[]): Promise<NatsSession> {
  const connection = await connect({ servers });
  const client = jetstream(connection);
  return {
    client,
    close: () => connection.close(),
    drain: () => connection.drain(),
  };
}

/**
 * Bind the stream and durable declared in the checked config. The read user has
 * no management permission, so acquisition never inspects or provisions them:
 * `consumers.get` is the only JetStream lookup. A missing declaration fails at
 * boot instead of being silently created from a second source of truth.
 */
export function natsEventsTransport(
  servers: string | string[],
  open: (servers: string | string[]) => Promise<NatsSession> = openNatsSession,
): EventsTransport {
  return {
    async acquire() {
      const session = await open(servers);
      try {
        const { client } = session;
        const durable = await client.consumers.get(
          GRAVESHIFT_EVENTS_STREAM.name,
          DETECTION_CONSUMER.durable_name,
        );
        const messages = await durable.consume({ max_messages: 1 });
        return {
          messages,
          publisher: createNatsPublisher(client),
          deadLetter: async (envelope, reason) => {
            await client.publish(
              deadLetterSubject(envelope.projectId, envelope.service),
              deadLetterMessage(envelope, reason),
            );
          },
          close: () => session.drain(),
        };
      } catch (error) {
        await session.close();
        throw error;
      }
    },
  };
}

/** The production entry point. The daemon supplies only granted Projects and a process port. */
export async function connectEventsConsumer(options: {
  servers: string | string[];
  grantedProjectIds: readonly string[];
}): Promise<EventsConsumer> {
  return createEventsConsumer({
    transport: natsEventsTransport(options.servers),
    grantedProjectIds: options.grantedProjectIds,
  });
}
