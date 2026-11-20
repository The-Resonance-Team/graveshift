import type { EventEnvelope } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import {
  createInMemoryPublisher,
  createNatsPublisher,
  type PublishTarget,
  publishSubject,
} from './index';

const envelope: EventEnvelope = {
  id: 'evt-1',
  tenantId: 'tenant-1',
  source: 'collector.docker',
  service: 'api',
  type: 'signal.oom',
  severity: 'info',
  observedAt: '2026-11-20T10:00:00.000Z',
  traceId: 'trace-1',
  fingerprint: 'api:oom',
  payload: { restarts: 3 },
};

interface Published {
  subject: string;
  payload: Uint8Array;
  options: { msgID: string };
}

function fakeTarget(): { target: PublishTarget; published: Published[] } {
  const published: Published[] = [];
  return {
    published,
    target: {
      publish(subject, payload, options) {
        published.push({ subject, payload, options });
        return Promise.resolve(undefined);
      },
    },
  };
}

describe('publish subject', () => {
  test('info uses the telemetry lane', () => {
    expect(publishSubject(envelope)).toBe('graveshift.tenant-1.telemetry.signal.oom');
  });

  for (const severity of ['warning', 'critical'] as const) {
    test(`${severity} uses the detection lane`, () => {
      expect(publishSubject({ ...envelope, severity })).toBe(
        'graveshift.tenant-1.detection.signal.oom',
      );
    });
  }
});

describe('createNatsPublisher', () => {
  test('propagates the envelope id as the idempotency key', async () => {
    const { target, published } = fakeTarget();
    await createNatsPublisher(target).publish(envelope);

    expect(published).toHaveLength(1);
    expect(published[0]?.options.msgID).toBe(envelope.id);
  });

  test('publishes the envelope as JSON on the right subject', async () => {
    const { target, published } = fakeTarget();
    await createNatsPublisher(target).publish({ ...envelope, severity: 'critical' });

    const record = published[0];
    expect(record?.subject).toBe('graveshift.tenant-1.detection.signal.oom');
    const decoded = JSON.parse(new TextDecoder().decode(record?.payload)) as EventEnvelope;
    expect(decoded).toEqual({ ...envelope, severity: 'critical' });
  });
});

describe('createInMemoryPublisher', () => {
  test('captures every published envelope', async () => {
    const publisher = createInMemoryPublisher();
    const second = { ...envelope, id: 'evt-2', severity: 'warning' as const };

    await publisher.publish(envelope);
    await publisher.publish(second);

    expect(publisher.envelopes).toEqual([envelope, second]);
  });
});
