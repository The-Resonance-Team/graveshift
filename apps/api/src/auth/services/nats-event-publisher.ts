import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { EventEnvelope } from '@graveshift/core';
import { connectNatsPublisher, type NatsPublisherHandle } from '@graveshift/events/nats';
import type { Publisher } from '@graveshift/events';

import { CREDENTIAL_CONFIG, type AuthConfig } from '../auth.types';

/** The production publisher. It connects only on the first publish. */
@Injectable()
export class NatsEventPublisher implements Publisher, OnModuleDestroy {
  private handle?: NatsPublisherHandle;

  constructor(@Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig) {}

  async publish(envelope: EventEnvelope): Promise<void> {
    if (!this.config.natsUrl) throw new ServiceUnavailableException('NATS is not configured');
    this.handle ??= await connectNatsPublisher(this.config.natsUrl);
    await this.handle.publisher.publish(envelope);
  }

  async onModuleDestroy(): Promise<void> {
    await this.handle?.close();
  }
}
