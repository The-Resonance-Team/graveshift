import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { EventEnvelope } from '@graveshift/core';
import type { Publisher } from '@graveshift/events';
import { connectNatsPublisher, type NatsPublisherHandle } from '@graveshift/events/nats';

import { CREDENTIAL_CONFIG, type AuthConfig } from '../auth.types';

/** The production publisher. One connection promise is shared by all first publishes. */
@Injectable()
export class NatsEventPublisher implements Publisher, OnModuleDestroy {
  private handlePromise?: Promise<NatsPublisherHandle>;

  constructor(@Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig) {}

  async publish(envelope: EventEnvelope): Promise<void> {
    if (!this.config.natsUrl) throw new ServiceUnavailableException('NATS is not configured');
    this.handlePromise ??= connectNatsPublisher(this.config.natsUrl);
    const handle = await this.handlePromise;
    await handle.publisher.publish(envelope);
  }

  async onModuleDestroy(): Promise<void> {
    await (await this.handlePromise)?.close();
  }
}
