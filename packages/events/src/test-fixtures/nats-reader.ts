import assert from 'node:assert/strict';
import { mock } from 'bun:test';

const mode = process.argv[2];
const failure = new Error('manager acquisition failed');
const reader = { streams: {} };
let closes = 0;
let closed = false;

mock.module('@nats-io/transport-node', () => ({
  async connect() {
    if (mode === 'connect-failure') throw failure;
    return {
      async close() {
        closes++;
        await Promise.resolve();
        closed = true;
      },
    };
  },
}));

mock.module('@nats-io/jetstream', () => ({
  jetstream() {
    return {
      async jetstreamManager() {
        if (mode === 'manager-failure') throw failure;
        return reader;
      },
    };
  },
}));

const { connectNatsReader } = await import('../nats');

if (mode === 'success') {
  const handle = await connectNatsReader('nats://test-only');
  assert.equal(handle.reader, reader);
  assert.equal(closes, 0);
  await handle.close();
  assert.equal(closes, 1);
  assert.equal(closed, true);
} else {
  await assert.rejects(connectNatsReader('nats://test-only'), (error) => error === failure);
  assert.equal(closes, mode === 'manager-failure' ? 1 : 0);
  assert.equal(closed, mode === 'manager-failure');
}
