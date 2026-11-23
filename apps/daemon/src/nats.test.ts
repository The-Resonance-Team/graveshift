import { publishSubject } from '@graveshift/events';
import { describe, expect, test } from 'bun:test';

import { ConsumerConfigError, decodeEvent, processQueued } from './nats';
import { caller, envelope } from './flow-fixtures';

function message() {
  const calls: string[] = [];
  return {
    calls,
    data: new TextEncoder().encode(JSON.stringify(envelope)),
    subject: publishSubject(envelope),
    term: () => {
      calls.push('term');
    },
    working: () => {
      calls.push('working');
    },
    nak: () => {
      calls.push('nak');
    },
    ackAck: async () => {
      calls.push('ack');
      return true;
    },
  };
}

describe('durable NATS delivery boundary', () => {
  test('reports an invalid consumer configuration with a stable error code', () => {
    const error = new ConsumerConfigError();
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('DAEMON_CONSUMER_CONFIG_INVALID');
    expect(error.message).toBe('Daemon consumer configuration is invalid');
  });

  test('validates project, subject, size, and envelope before dispatch', () => {
    const queued = message();
    expect(decodeEvent(queued.data, caller.projectId, queued.subject)).toMatchObject({
      id: envelope.id,
    });
    expect(decodeEvent(queued.data, 'foreign', queued.subject)).toBeNull();
    expect(
      decodeEvent(queued.data, caller.projectId, 'graveshift.foreign.detection.runtime.oom'),
    ).toBeNull();
    expect(decodeEvent(new TextEncoder().encode('{'), caller.projectId, queued.subject)).toBeNull();
    expect(decodeEvent(new Uint8Array(1_048_577), caller.projectId, queued.subject)).toBeNull();
  });

  test('acknowledges only after owned writes finish', async () => {
    const queued = message();
    const durable = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const processed = processQueued(queued, caller.projectId, async () => {
      entered.resolve();
      await durable.promise;
    });
    await entered.promise;
    expect(queued.calls).toEqual([]);
    durable.resolve();
    await processed;
    expect(queued.calls).toEqual(['ack']);
  });

  test('requests redelivery after failed writes or a lost acknowledgement', async () => {
    const failed = message();
    await processQueued(failed, caller.projectId, async () => {
      throw new Error('Storage unavailable');
    });
    expect(failed.calls).toEqual(['nak']);
    const lost = message();
    lost.ackAck = async () => {
      lost.calls.push('ack');
      return false;
    };
    await processQueued(lost, caller.projectId, async () => {});
    expect(lost.calls).toEqual(['ack', 'nak']);
  });

  test('terminates an invalid queued payload without dispatch', async () => {
    const queued = message();
    queued.data = new TextEncoder().encode('null');
    let dispatched = false;
    await processQueued(queued, caller.projectId, async () => {
      dispatched = true;
    });
    expect(dispatched).toBe(false);
    expect(queued.calls).toEqual(['term']);
  });
});
