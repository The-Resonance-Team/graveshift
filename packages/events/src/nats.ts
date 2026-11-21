import { jetstream, type JetStreamClient } from '@nats-io/jetstream';
import { connect, type NatsConnection } from '@nats-io/transport-node';

import { createNatsPublisher, type Publisher } from './index';

export interface NatsPublisherHandle {
  publisher: Publisher;
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
