import { EventEnvelopeSchema } from '@graveshift/core';
import { createInMemoryPublisher, type InMemoryPublisher } from '@graveshift/events/testing';
import { describe, expect, test } from 'bun:test';

import {
  type Clock,
  type Context,
  envelopeBuilder,
  type Integration,
  validateContext,
} from './index';

const fixedClock: Clock = {
  now: () => '2026-11-20T10:00:00.000Z',
  newId: () => 'id-1',
};

function makeContext(): { context: Context; publisher: InMemoryPublisher } {
  const publisher = createInMemoryPublisher();
  return {
    context: { publisher, tenantId: 'tenant-1', service: 'api' },
    publisher,
  };
}

describe('envelopeBuilder', () => {
  test('builds an envelope valid under the core schema', () => {
    const { context } = makeContext();
    const envelope = envelopeBuilder(
      context,
      fixedClock,
    )({
      source: 'collector.fake',
      type: 'signal.fake',
      severity: 'warning',
      traceId: 'trace-1',
      fingerprint: 'fake_signal',
      payload: { count: 1 },
    });

    expect(() => EventEnvelopeSchema.parse(envelope)).not.toThrow();
    expect(envelope).toEqual({
      id: 'id-1',
      tenantId: 'tenant-1',
      source: 'collector.fake',
      service: 'api',
      type: 'signal.fake',
      severity: 'warning',
      observedAt: '2026-11-20T10:00:00.000Z',
      traceId: 'trace-1',
      fingerprint: 'fake_signal',
      payload: { count: 1 },
    });
  });

  test('uses an empty payload and the system clock by default', () => {
    const { context } = makeContext();
    const envelope = envelopeBuilder(context)({
      source: 'nestjs_plugin',
      type: 'http.request',
      severity: 'info',
      traceId: 'trace-2',
      fingerprint: 'http_request',
    });

    expect(envelope.payload).toEqual({});
    expect(envelope.id).toBeTruthy();
    expect(envelope.observedAt).toBeTruthy();
    expect(envelope.severity).toBe('info');
  });
});

// A minimal daemon-side Collector example: a fake source that publishes once.
const fakeCollector: Integration = {
  name: 'fake-source',
  kind: 'collector',
  start(context) {
    const build = envelopeBuilder(context, fixedClock);
    return context.publisher.publish(
      build({
        source: 'collector.fake',
        type: 'signal.fake',
        severity: 'warning',
        traceId: 'trace-3',
        fingerprint: 'fake_signal',
        payload: { observed: 1 },
      }),
    );
  },
  stop() {},
};

describe('validateContext', () => {
  test('accepts a valid context', () => {
    const { context } = makeContext();
    expect(() => validateContext(context)).not.toThrow();
  });

  test('rejects a missing publisher, tenantId or service', () => {
    const { context } = makeContext();
    expect(() => validateContext({ ...context, publisher: {} as never })).toThrow('publisher');
    expect(() => validateContext({ ...context, tenantId: 'bad tenant' })).toThrow('tenantId');
    expect(() => validateContext({ ...context, service: '' })).toThrow('service');
    expect(() => validateContext(undefined as never)).toThrow('object');
  });
});

describe('Collector example', () => {
  test('publishes one valid envelope when started', async () => {
    expect(fakeCollector.kind).toBe('collector');
    expect(fakeCollector.name).toBe('fake-source');

    const { context, publisher } = makeContext();
    expect(publisher.envelopes).toHaveLength(0);

    await fakeCollector.start(context);

    expect(publisher.envelopes).toHaveLength(1);
    const [envelope] = publisher.envelopes;
    expect(envelope).toBeDefined();
    expect(() => EventEnvelopeSchema.parse(envelope)).not.toThrow();
    expect(envelope).toMatchObject({
      tenantId: 'tenant-1',
      service: 'api',
      source: 'collector.fake',
      severity: 'warning',
    });
  });

  test('stop resolves without publishing', async () => {
    const { publisher } = makeContext();
    await fakeCollector.stop();
    expect(publisher.envelopes).toHaveLength(0);
  });
});
