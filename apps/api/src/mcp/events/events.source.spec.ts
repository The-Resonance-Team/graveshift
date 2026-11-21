import type { EventEnvelope } from '@graveshift/core';
import type { EventsReader } from '@graveshift/events/nats';
import { describe, expect, test } from 'bun:test';

import { validEnvelope } from '../../../test/fakes/auth-test-helpers';
import type { EventsConfig } from './events.config';
import { NatsEventSource } from './events.source';

const config: EventsConfig = { stream: 'GRAVESHIFT_EVENTS' };
const encoder = new TextEncoder();

interface ReaderOptions {
  firstSeq?: number;
  lastSeq: number;
  message?: (seq: number) => Promise<{ seq: number; data: Uint8Array } | null>;
}

function fakeReader(options: ReaderOptions): EventsReader {
  return {
    streams: {
      info: () =>
        Promise.resolve({
          state: { first_seq: options.firstSeq ?? 1, last_seq: options.lastSeq },
        }),
      getMessage: (_stream, query) =>
        options.message ? options.message(query.seq) : Promise.resolve(null),
    },
  };
}

function bytes(envelope: EventEnvelope): Uint8Array {
  return encoder.encode(JSON.stringify(envelope));
}

describe('NatsEventSource', () => {
  test('skips a bad JSON entry and serves the next entry', async () => {
    const source = new NatsEventSource(
      config,
      fakeReader({
        lastSeq: 2,
        message: (seq) =>
          Promise.resolve(
            seq === 1
              ? { seq, data: encoder.encode('not json') }
              : { seq, data: bytes(validEnvelope({ id: 'good', type: 'signal.oom' })) },
          ),
      }),
    );
    const result = await source.read(0, 2);
    expect(result.events.map((event) => event.envelope.id)).toEqual(['good']);
    expect(result.scannedThroughSeq).toBe(2);
  });

  test('propagates a transient getMessage error so the poll can retry', async () => {
    const source = new NatsEventSource(
      config,
      fakeReader({
        lastSeq: 2,
        message: (seq) =>
          seq === 1
            ? Promise.reject(new Error('transient NATS timeout'))
            : Promise.resolve({
                seq,
                data: bytes(validEnvelope({ id: 'after', type: 'signal.oom' })),
              }),
      }),
    );
    const error = await source.read(0, 2).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as { message: string }).message).toContain('transient NATS timeout');
  });

  test('skips a sequence that getMessage reports as missing', async () => {
    const source = new NatsEventSource(
      config,
      fakeReader({
        lastSeq: 2,
        message: (seq) =>
          seq === 1
            ? Promise.resolve(null)
            : Promise.resolve({
                seq,
                data: bytes(validEnvelope({ id: 'after', type: 'signal.oom' })),
              }),
      }),
    );
    const result = await source.read(0, 2);
    expect(result.events.map((event) => event.envelope.id)).toEqual(['after']);
    expect(result.scannedThroughSeq).toBe(2);
  });

  test('clamps a cursor below the retained window and reports truncated', async () => {
    const source = new NatsEventSource(
      config,
      fakeReader({
        firstSeq: 5,
        lastSeq: 6,
        message: (seq) =>
          Promise.resolve({
            seq,
            data: bytes(validEnvelope({ id: `evt-${seq}`, type: 'signal.oom' })),
          }),
      }),
    );
    const result = await source.read(0, 10);
    expect(result.truncated).toBe(true);
    expect(result.events.map((event) => event.seq)).toEqual([5, 6]);
    expect(result.scannedThroughSeq).toBe(6);
  });

  test('reports the scanned position when the window stops before the head', async () => {
    const source = new NatsEventSource(
      config,
      fakeReader({
        lastSeq: 10,
        message: (seq) =>
          Promise.resolve({
            seq,
            data: bytes(validEnvelope({ id: `evt-${seq}`, type: 'signal.oom' })),
          }),
      }),
    );
    const result = await source.read(0, 3);
    expect(result.headSeq).toBe(10);
    expect(result.scannedThroughSeq).toBe(3);
    expect(result.events).toHaveLength(3);
  });

  test('fails closed when NATS is not configured', async () => {
    const source = new NatsEventSource({ stream: 'GRAVESHIFT_EVENTS' });
    const error = await source.read(0, 10).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as { message: string }).message).toContain('NATS is not configured');
  });

  test('shares the first reader connection across concurrent polls and closes it', async () => {
    let resolveConnection!: (value: { reader: EventsReader; close(): Promise<void> }) => void;
    let connects = 0;
    let closes = 0;
    const reader = fakeReader({ lastSeq: 0 });
    const pending = new Promise<{ reader: EventsReader; close(): Promise<void> }>((resolve) => {
      resolveConnection = resolve;
    });
    const source = new NatsEventSource(
      { ...config, natsUrl: 'nats://local' },
      undefined,
      async () => {
        connects++;
        return pending;
      },
    );
    const first = source.read(null, 1);
    const second = source.read(null, 1);
    resolveConnection({ reader, close: async () => void closes++ });
    await Promise.all([first, second]);
    expect(connects).toBe(1);
    await source.onModuleDestroy();
    expect(closes).toBe(1);
  });

  test('clears a failed reader connection so a later poll can retry', async () => {
    let connects = 0;
    const reader = fakeReader({ lastSeq: 0 });
    const source = new NatsEventSource(
      { ...config, natsUrl: 'nats://local' },
      undefined,
      async () => {
        connects++;
        if (connects === 1) throw new Error('temporary connect failure');
        return { reader, close: async () => {} };
      },
    );
    await expect(source.read(null, 1)).rejects.toThrow('temporary connect failure');
    await source.read(null, 1);
    expect(connects).toBe(2);
    await source.onModuleDestroy();
  });
});
