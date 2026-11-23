import { GraveshiftError, prepareEnvelope, type EventEnvelope } from '@graveshift/core';
import { createNatsPublisher, publishSubject, type Publisher } from '@graveshift/events';
import {
  AckPolicy,
  DeliverPolicy,
  jetstream,
  JetStreamApiCodes,
  JetStreamApiError,
  StorageType,
  type JsMsg,
} from '@nats-io/jetstream';
import { connect } from '@nats-io/transport-node';

export class ConsumerConfigError extends GraveshiftError<'DAEMON_CONSUMER_CONFIG_INVALID'> {
  constructor() {
    super('DAEMON_CONSUMER_CONFIG_INVALID', 'Daemon consumer configuration is invalid');
  }
}

export interface ConsumerOptions {
  servers: string;
  stream: string;
  projectId: string;
}

export interface EventConsumer {
  publisher: Publisher;
  run(process: (envelope: EventEnvelope) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}

export function decodeEvent(
  data: Uint8Array,
  projectId: string,
  subject: string,
): EventEnvelope | null {
  if (data.byteLength > 1_048_576) return null;
  try {
    const envelope = prepareEnvelope(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)),
    );
    return envelope.projectId === projectId && subject === publishSubject(envelope)
      ? envelope
      : null;
  } catch {
    return null;
  }
}

export async function processQueued(
  message: Pick<JsMsg, 'data' | 'subject' | 'term' | 'working' | 'nak' | 'ackAck'>,
  projectId: string,
  process: (envelope: EventEnvelope) => Promise<void>,
): Promise<void> {
  const event = decodeEvent(message.data, projectId, message.subject);
  if (event === null) {
    message.term('Invalid or foreign Event envelope');
    return;
  }
  const heartbeat = setInterval(() => message.working(), 10_000);
  try {
    await process(event);
    if (!(await message.ackAck())) throw new Error('Event acknowledgement failed');
  } catch {
    message.nak(1000);
  } finally {
    clearInterval(heartbeat);
  }
}

export async function connectConsumer(options: ConsumerOptions): Promise<EventConsumer> {
  const connection = await connect({ servers: options.servers, name: 'graveshift-daemon' });
  try {
    const client = jetstream(connection);
    const manager = await client.jetstreamManager();
    try {
      await manager.streams.info(options.stream);
    } catch (error) {
      if (!(error instanceof JetStreamApiError) || error.code !== JetStreamApiCodes.StreamNotFound)
        throw error;
      await manager.streams.add({
        name: options.stream,
        subjects: ['graveshift.*.>'],
        storage: StorageType.File,
      });
    }
    const durable = `daemon-${options.projectId}`;
    const filter = `graveshift.${options.projectId}.>`;
    try {
      const existing = await manager.consumers.info(options.stream, durable);
      if (
        existing.config.ack_policy !== AckPolicy.Explicit ||
        existing.config.filter_subject !== filter ||
        existing.config.deliver_subject !== undefined
      )
        throw new ConsumerConfigError();
    } catch (error) {
      if (
        !(error instanceof JetStreamApiError) ||
        error.code !== JetStreamApiCodes.ConsumerNotFound
      )
        throw error;
      await manager.consumers.add(options.stream, {
        durable_name: durable,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
        filter_subject: filter,
        ack_wait: 240_000_000_000,
        max_ack_pending: 1,
      });
    }
    const consumer = await client.consumers.get(options.stream, durable);
    const messages = await consumer.consume({ max_messages: 1 });
    let stopping = false;
    let running: Promise<void> | undefined;
    return {
      publisher: createNatsPublisher(client),
      run(process) {
        if (running !== undefined) throw new Error('Daemon consumer is already running');
        running = (async () => {
          for await (const message of messages) {
            if (stopping) break;
            await processQueued(message, options.projectId, process);
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
          await connection.drain();
        }
      },
    };
  } catch (error) {
    await connection.close();
    throw error;
  }
}
