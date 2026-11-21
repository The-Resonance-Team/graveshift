import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { EventEnvelope } from '@graveshift/core';
import type { Publisher } from '@graveshift/events';
import type { NatsPublisherHandle } from '@graveshift/events/nats';

import { EVENTS_CONFIG, type EventsConfig } from '../../mcp/events/events.config';
import { NATS_CONNECTOR, type NatsConnector } from '../auth.types';

/** The production publisher. One connection promise is shared by concurrent publishes. */
@Injectable()
export class NatsEventPublisher implements Publisher, OnModuleDestroy {
  private handlePromise: Promise<NatsPublisherHandle> | undefined = undefined;

  constructor(
    @Inject(EVENTS_CONFIG) private readonly config: EventsConfig,
    @Inject(NATS_CONNECTOR) private readonly connect: NatsConnector,
  ) {}

  async publish(envelope: EventEnvelope): Promise<void> {
    if (!this.config.natsUrl) throw new ServiceUnavailableException('NATS is not configured');
    const handle = await this.connection();
    await handle.publisher.publish(envelope);
  }

  private connection(): Promise<NatsPublisherHandle> {
    if (!this.handlePromise) {
      const url = this.config.natsUrl;
      if (!url) throw new ServiceUnavailableException('NATS is not configured');
      const pending = this.connect(url).catch((error: unknown) => {
        // A failed connect must not be cached: the next publish retries.
        if (this.handlePromise === pending) this.handlePromise = undefined;
        throw new ServiceUnavailableException(
          error instanceof Error ? error.message : 'NATS is unavailable',
        );
      });
      this.handlePromise = pending;
    }
    return this.handlePromise;
  }

  async onModuleDestroy(): Promise<void> {
    // Ignore a rejected connection: shutdown must not throw.
    const handle = await this.handlePromise?.catch(() => undefined);
    await handle?.close();
  }
}
