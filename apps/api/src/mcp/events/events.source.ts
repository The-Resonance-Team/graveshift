import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { EventEnvelopeSchema, type EventEnvelope } from '@graveshift/core';
import { jetstream, type JetStreamManager } from '@nats-io/jetstream';
import { connect, type NatsConnection } from '@nats-io/transport-node';

import { CREDENTIAL_CONFIG, type AuthConfig } from '../../auth/auth.types';
import type { EventReadResult, EventSource, StoredEvent } from './events.types';

/** Default stream for normalised envelopes. JetStream is the only backbone. */
export const DEFAULT_EVENTS_STREAM = 'GRAVESHIFT_EVENTS';

/** Bounded source used by tests. `headSeq` is the last assigned sequence. */
@Injectable()
export class InMemoryEventSource implements EventSource {
  private seq = 0;
  private readonly stored: StoredEvent[] = [];

  push(envelope: EventEnvelope): number {
    this.stored.push({ seq: ++this.seq, envelope });
    return this.seq;
  }

  read(afterSeq: number | null, maxEvents: number): Promise<EventReadResult> {
    const from = afterSeq === null ? this.seq + 1 : afterSeq + 1;
    return Promise.resolve({
      headSeq: this.seq,
      events: this.stored.filter((item) => item.seq >= from).slice(0, maxEvents),
    });
  }
}

const decoder = new TextDecoder();

/**
 * Reads envelopes from JetStream by stream sequence. The connection opens on
 * the first read, as the publisher does. A cursor is the stream sequence.
 */
@Injectable()
export class NatsEventSource implements EventSource, OnModuleDestroy {
  private manager?: JetStreamManager;
  private connection?: NatsConnection;

  constructor(@Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig) {}

  private async js(): Promise<JetStreamManager> {
    if (!this.config.natsUrl) throw new ServiceUnavailableException('NATS is not configured');
    if (!this.manager) {
      this.connection = await connect({ servers: this.config.natsUrl });
      this.manager = await jetstream(this.connection).jetstreamManager();
    }
    return this.manager;
  }

  private stream(): string {
    return this.config.natsStream ?? DEFAULT_EVENTS_STREAM;
  }

  async read(afterSeq: number | null, maxEvents: number): Promise<EventReadResult> {
    const js = await this.js();
    const info = await js.streams.info(this.stream());
    const headSeq = info.state.last_seq;
    if (afterSeq === null || headSeq <= afterSeq) {
      return { headSeq, events: [] };
    }

    const last = Math.min(headSeq, afterSeq + maxEvents);
    const seqs = Array.from({ length: last - afterSeq }, (_, index) => afterSeq + 1 + index);
    const messages = await Promise.all(
      seqs.map((seq) => js.streams.getMessage(this.stream(), { seq })),
    );
    const events: StoredEvent[] = [];
    for (const message of messages) {
      if (!message) continue;
      const parsed = EventEnvelopeSchema.safeParse(
        JSON.parse(decoder.decode(message.data)) as unknown,
      );
      if (!parsed.success) continue;
      events.push({ seq: message.seq, envelope: parsed.data });
    }
    return { headSeq, events };
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }
}
