import { jetstream, type JetStreamClient } from '@nats-io/jetstream';
import { connect, type NatsConnection } from '@nats-io/transport-node';

import { createNatsPublisher, type Publisher } from './index';

export interface NatsPublisherHandle {
  publisher: Publisher;
  close(): Promise<void>;
}

/** The small part of the stream API that the read side uses. */
export interface EventsStreamInfo {
  state: { first_seq: number; last_seq: number };
}

export interface EventsStreams {
  info(stream: string): Promise<EventsStreamInfo>;
  getMessage(
    stream: string,
    query: { seq: number },
  ): Promise<{ seq: number; data: Uint8Array } | null>;
}

/** The read side of JetStream. A real manager satisfies this shape. */
export interface EventsReader {
  streams: EventsStreams;
}

export interface NatsReaderHandle {
  reader: EventsReader;
  close(): Promise<void>;
}

/** Connect with the official NATS client and return a JetStream publisher. */
export async function connectNatsPublisher(
  servers: string | string[],
): Promise<NatsPublisherHandle> {
  const nc: NatsConnection = await connect({ servers });
  const js: JetStreamClient = jetstream(nc);
  return {
    publisher: createNatsPublisher(js),
    close: () => nc.close(),
  };
}

/**
 * Connect with the official NATS client and return the JetStream read API.
 * This is the only NATS connection helper for the Events read side.
 */
export async function connectNatsReader(servers: string | string[]): Promise<NatsReaderHandle> {
  const nc: NatsConnection = await connect({ servers });
  try {
    const manager = await jetstream(nc).jetstreamManager();
    return {
      reader: manager,
      close: () => nc.close(),
    };
  } catch (error) {
    await nc.close();
    throw error;
  }
}
