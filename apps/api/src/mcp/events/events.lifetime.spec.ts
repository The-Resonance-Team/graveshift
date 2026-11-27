import { describe, expect, test } from 'bun:test';
import type { NatsReaderHandle } from '@graveshift/events/nats';

import { NatsEventSource } from './events.source';

const config = { stream: 'GRAVESHIFT_EVENTS', natsUrl: 'nats://local.test:4222' };

function handle() {
  let closes = 0;
  let reads = 0;
  const value: NatsReaderHandle = {
    reader: {
      streams: {
        async info() {
          reads++;
          return { state: { first_seq: 1, last_seq: 0 } };
        },
        async getMessage() {
          return null;
        },
      },
    },
    async close() {
      closes++;
    },
  };
  return { value, closes: () => closes, reads: () => reads };
}

describe('Event reader lifetime', () => {
  test('concurrent cold reads share one connection and shutdown closes it once', async () => {
    const pending = Promise.withResolvers<NatsReaderHandle>();
    const connected = handle();
    let connects = 0;
    const source = new NatsEventSource(config, async () => {
      connects++;
      return pending.promise;
    });
    const reads = Promise.all([source.read(null, 1), source.read(null, 1)]);
    expect(connects).toBe(1);
    pending.resolve(connected.value);
    await reads;
    expect(connected.reads()).toBe(2);
    await Promise.all([source.onModuleDestroy(), source.onModuleDestroy()]);
    expect(connected.closes()).toBe(1);
  });

  test('failed acquisition can retry without exposing its raw error', async () => {
    const connected = handle();
    let connects = 0;
    const source = new NatsEventSource(config, async () => {
      if (++connects === 1) throw new Error('Bearer sensitive-token');
      return connected.value;
    });
    await expect(source.read(null, 1)).rejects.toThrow('Event reader is unavailable');
    const result = await source.read(null, 1);
    expect(connects).toBe(2);
    expect(result.events).toEqual([]);
    await source.onModuleDestroy();
    expect(connected.closes()).toBe(1);
  });

  // The explicit timeout makes a regression fail fast instead of hanging CI.
  test('shutdown waits for pending acquisition and stops reads before using its handle', async () => {
    let resolve: (value: NatsReaderHandle) => void = () => undefined;
    const pending = new Promise<NatsReaderHandle>((done) => {
      resolve = done;
    });
    const connected = handle();
    const source = new NatsEventSource(config, () => pending);
    const read = source.read(null, 1).then(
      () => 'resolved',
      (error: unknown) => (error instanceof Error ? error.message : 'unknown'),
    );
    const close = source.onModuleDestroy();
    resolve(connected.value);
    expect(await read).toBe('Event reader is closed');
    await close;
    expect(connected.reads()).toBe(0);
    expect(connected.closes()).toBe(1);
    await expect(source.read(null, 1)).rejects.toThrow('Event reader is closed');
  }, 5000);

  test('shutdown is bounded when acquisition never settles, and closes a late handle once', async () => {
    let resolve: (value: NatsReaderHandle) => void = () => undefined;
    const pending = new Promise<NatsReaderHandle>((done) => {
      resolve = done;
    });
    const connected = handle();
    const source = new NatsEventSource(config, () => pending, undefined, 20);
    const read = source.read(null, 1).catch(() => undefined);
    await source.onModuleDestroy();
    expect(connected.closes()).toBe(0);
    resolve(connected.value);
    await read;
    await Bun.sleep(5);
    expect(connected.closes()).toBe(1);
    await source.onModuleDestroy();
    expect(connected.closes()).toBe(1);
  }, 5000);
});
