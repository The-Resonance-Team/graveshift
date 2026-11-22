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

/** Optional reader seams for tests. Production connects lazily on the first poll. */
export const NATS_READER = Symbol('NATS_READER');
export const NATS_READER_CONNECTOR = Symbol('NATS_READER_CONNECTOR');
export const NATS_READER_CONNECT = Symbol('NATS_READER_CONNECT');
/** Optional override of how long shutdown waits for a pending connection. */
export const NATS_SHUTDOWN_WAIT_MS = Symbol('NATS_SHUTDOWN_WAIT_MS');
const DEFAULT_SHUTDOWN_WAIT_MS = 5000;
export type NatsReaderConnector = typeof connectNatsReader;
export type ReaderConnector = (servers: string) => Promise<NatsReaderHandle>;

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
// Bound concurrent stream reads. A full window holds at most this many calls.
const FETCH_CONCURRENCY = 16;

/** Reads envelopes from JetStream by stream sequence. A cursor is a sequence. */
@Injectable()
export class NatsEventSource implements EventSource, OnModuleDestroy {
  private pending: Promise<NatsReaderHandle> | undefined;
  private handle: NatsReaderHandle | undefined;
  private closed = false;
  private closing: Promise<void> | undefined;
  private readonly injected: EventsReader | undefined;
  private readonly connect: ReaderConnector;
  private readonly surfaceConnectError: boolean;
  private readonly closedHandles = new WeakSet<NatsReaderHandle>();

  constructor(
    @Inject(EVENTS_CONFIG) private readonly config: EventsConfig,
    @Optional()
    @Inject(NATS_READER)
    injectedOrConnect?: EventsReader | ReaderConnector,
    @Optional()
    @Inject(NATS_READER_CONNECTOR)
    connectReader?: NatsReaderConnector,
    @Optional()
    @Inject(NATS_SHUTDOWN_WAIT_MS)
    private readonly shutdownWaitMs: number = DEFAULT_SHUTDOWN_WAIT_MS,
  ) {
    if (typeof injectedOrConnect === 'function') {
      // The two-argument form binds the connector at the second position.
      this.connect = injectedOrConnect;
      this.surfaceConnectError = false;
    } else {
      this.injected = injectedOrConnect;
      this.connect = connectReader ?? connectNatsReader;
      this.surfaceConnectError = true;
    }
  }

  private async reader(): Promise<EventsReader> {
    if (this.injected) return this.injected;
    if (this.closed) throw new ServiceUnavailableException('Event reader is closed');
    const url = this.config.natsUrl;
    if (!url) throw new ServiceUnavailableException('NATS is not configured');
    if (!this.pending) {
      const pending = this.connect(url).catch((error: unknown) => {
        if (this.pending === pending) this.pending = undefined;
        // The injected-reader form hides credentials; the platform connector
        // form keeps the original error so a poll can report it and retry.
        if (this.surfaceConnectError) throw error;
        throw new ServiceUnavailableException('Event reader is unavailable');
      });
      this.pending = pending;
    }
    const handle = await this.pending;
    if (this.closed) throw new ServiceUnavailableException('Event reader is closed');
    this.handle = handle;
    return handle.reader;
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
    const events = await this.fetch(reader, seqs, 0, []);
    return { firstSeq, headSeq, scannedThroughSeq: end, events, truncated };
  }

  /**
   * Fetch one bounded batch at a time. A getMessage error propagates so the
   * poll fails and the client can retry; only bad payloads are skipped.
   */
  private async fetch(
    reader: EventsReader,
    seqs: number[],
    index: number,
    acc: StoredEvent[],
  ): Promise<StoredEvent[]> {
    const batch = seqs.slice(index, index + FETCH_CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (seq): Promise<StoredEvent | undefined> => {
        const message = await reader.streams.getMessage(this.config.stream, { seq });
        if (!message) return undefined;
        try {
          const value: unknown = JSON.parse(decoder.decode(message.data));
          const parsed = EventEnvelopeSchema.safeParse(value);
          return parsed.success ? { seq: message.seq, envelope: parsed.data } : undefined;
        } catch {
          // A bad entry must not stop the other entries in this batch.
          return undefined;
        }
      }),
    );
    const next = acc.concat(settled.filter((item): item is StoredEvent => item !== undefined));
    if (index + FETCH_CONCURRENCY >= seqs.length) return next;
    return this.fetch(reader, seqs, index + FETCH_CONCURRENCY, next);
  }

  /** Close a handle at most once, however many paths reach it. */
  private closeOnce(handle: NatsReaderHandle): Promise<void> {
    if (this.closedHandles.has(handle)) return Promise.resolve();
    this.closedHandles.add(handle);
    return handle.close();
  }

  /** Wait for the pending connection, but never longer than the shutdown bound. */
  private async settlePending(pending: Promise<NatsReaderHandle>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(resolve, this.shutdownWaitMs, undefined);
    });
    try {
      return await Promise.race([pending.catch(() => undefined), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  onModuleDestroy(): Promise<void> {
    this.closed = true;
    this.closing ??= (async () => {
      const pending = this.pending;
      if (pending) {
        const handle = await this.settlePending(pending);
        if (handle) await this.closeOnce(handle);
        // A connection that settles after the bound is closed when it arrives.
        else void pending.then((late) => this.closeOnce(late)).catch(() => undefined);
      }
      if (this.handle) await this.closeOnce(this.handle);
    })();
    return this.closing;
  }
}
