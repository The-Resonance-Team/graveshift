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

  test('shutdown waits for pending acquisition and stops reads before using its handle', async () => {
    const pending = Promise.withResolvers<NatsReaderHandle>();
    const connected = handle();
    const source = new NatsEventSource(config, () => pending.promise);
    const read = source.read(null, 1);
    const assertion = expect(read).rejects.toThrow('Event reader is closed');
    const close = source.onModuleDestroy();
    pending.resolve(connected.value);
    await assertion;
    await close;
    expect(connected.reads()).toBe(0);
    expect(connected.closes()).toBe(1);
    await expect(source.read(null, 1)).rejects.toThrow('Event reader is closed');
  });
});
