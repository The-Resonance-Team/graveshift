import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { EventEnvelopeSchema, type EventEnvelope } from '@graveshift/core';
import {
  connectNatsReader,
  type EventsReader,
  type NatsReaderHandle,
} from '@graveshift/events/nats';

import { EVENTS_CONFIG, type EventsConfig } from './events.config';
import type { EventReadResult, EventSource, StoredEvent } from './events.types';

/** Optional reader seam for tests. Production connects lazily on the first poll. */
export const NATS_READER = Symbol('NATS_READER');

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
    if (afterSeq === null) {
      return Promise.resolve({
        firstSeq: 1,
        headSeq: this.seq,
        scannedThroughSeq: this.seq,
        events: [],
        truncated: false,
      });
    }
    const firstSeq = 1;
    const truncated = afterSeq < firstSeq - 1;
    const from = Math.max(afterSeq + 1, firstSeq);
    const end = Math.min(this.seq, from + maxEvents - 1);
    if (end < from) {
      return Promise.resolve({
        firstSeq,
        headSeq: this.seq,
        scannedThroughSeq: Math.max(this.seq, afterSeq),
        events: [],
        truncated,
      });
    }
    return Promise.resolve({
      firstSeq,
      headSeq: this.seq,
      scannedThroughSeq: end,
      events: this.stored.filter((item) => item.seq >= from && item.seq <= end),
      truncated,
    });
  }
}

const decoder = new TextDecoder();

/** Reads envelopes from JetStream by stream sequence. A cursor is a sequence. */
@Injectable()
export class NatsEventSource implements EventSource, OnModuleDestroy {
  private cached?: EventsReader;
  private handle?: NatsReaderHandle;

  constructor(
    @Inject(EVENTS_CONFIG) private readonly config: EventsConfig,
    @Optional() @Inject(NATS_READER) private readonly injected?: EventsReader,
  ) {}

  private async reader(): Promise<EventsReader> {
    if (this.injected) return this.injected;
    if (this.cached) return this.cached;
    if (!this.config.natsUrl) throw new ServiceUnavailableException('NATS is not configured');
    this.handle = await connectNatsReader(this.config.natsUrl);
    this.cached = this.handle.reader;
    return this.cached;
  }

  async read(afterSeq: number | null, maxEvents: number): Promise<EventReadResult> {
    const reader = await this.reader();
    const info = await reader.streams.info(this.config.stream);
    const firstSeq = info.state.first_seq;
    const headSeq = info.state.last_seq;
    if (afterSeq === null) {
      return { firstSeq, headSeq, scannedThroughSeq: headSeq, events: [], truncated: false };
    }

    // A cursor below the retained window can no longer be served. Clamp it.
    const truncated = afterSeq < firstSeq - 1;
    const from = Math.max(afterSeq + 1, firstSeq);
    const end = Math.min(headSeq, from + maxEvents - 1);
    if (end < from) {
      return {
        firstSeq,
        headSeq,
        scannedThroughSeq: Math.max(headSeq, afterSeq),
        events: [],
        truncated,
      };
    }

    const seqs = Array.from({ length: end - from + 1 }, (_, index) => from + index);
    const settled = await Promise.all(
      seqs.map(async (seq): Promise<StoredEvent | undefined> => {
        try {
          const message = await reader.streams.getMessage(this.config.stream, { seq });
          if (!message) return undefined;
          const value: unknown = JSON.parse(decoder.decode(message.data));
          const parsed = EventEnvelopeSchema.safeParse(value);
          return parsed.success ? { seq: message.seq, envelope: parsed.data } : undefined;
        } catch {
          // A purged sequence or a bad entry must not stop the other entries.
          return undefined;
        }
      }),
    );
    const events = settled.filter((item): item is StoredEvent => item !== undefined);
    return { firstSeq, headSeq, scannedThroughSeq: end, events, truncated };
  }

  async onModuleDestroy(): Promise<void> {
    await this.handle?.close();
  }
}
