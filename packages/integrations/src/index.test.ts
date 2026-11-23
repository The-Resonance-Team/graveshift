import { EnvelopeError, EventEnvelopeSchema } from '@graveshift/core';
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
    context: { publisher, projectId: 'project-1', service: 'api' },
    publisher,
  };
}

describe('envelopeBuilder', () => {
  test('preserves native event identity and observation time', () => {
    const { context } = makeContext();
    const result = envelopeBuilder(
      context,
      fixedClock,
    )({
      id: 'native-id',
      observedAt: '2026-11-19T10:00:00.000Z',
      source: 'collector.test',
      type: 'runtime.oom',
      severity: 'critical',
      traceId: 'trace-1',
      fingerprint: 'api:oom',
    });
    expect(result.id).toBe('native-id');
    expect(result.observedAt).toBe('2026-11-19T10:00:00.000Z');
  });
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
      projectId: 'project-1',
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

  test('prepares privacy data while keeping the context project and service binding', () => {
    const { context } = makeContext();
    const extraFields = { projectId: 'foreign-project', service: 'foreign-service' };
    const envelope = envelopeBuilder(
      context,
      fixedClock,
    )({
      ...extraFields,
      source: 'plugin ops@example.com',
      type: 'http.request',
      severity: 'info',
      traceId: 'trace-1',
      fingerprint: 'http_request',
      payload: { password: 'opaque', message: 'ops@example.com' },
    });
    expect(envelope.projectId).toBe(context.projectId);
    expect(envelope.service).toBe(context.service);
    expect(envelope.source).toBe('plugin [REDACTED:email]');
    expect(envelope.payload).toEqual({ message: '[REDACTED:email]' });
    expect(EventEnvelopeSchema.parse(JSON.parse(JSON.stringify(envelope)))).toEqual(envelope);
  });

  test('rejects recognized secrets in producer identity', () => {
    const { context } = makeContext();
    const build = envelopeBuilder(context, fixedClock);
    expect(() =>
      build({
        source: 'plugin.test',
        type: 'http.request',
        severity: 'info',
        traceId: 'ops@example.com',
        fingerprint: 'http_request',
      }),
    ).toThrow(EnvelopeError);
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

  test('rejects a missing publisher, projectId or service', () => {
    const { context } = makeContext();
    expect(() => validateContext({ ...context, publisher: {} })).toThrow('publisher');
    expect(() => validateContext({ ...context, projectId: 'bad project' })).toThrow('projectId');
    expect(() => validateContext({ ...context, service: '' })).toThrow('service');
    expect(() => validateContext(undefined)).toThrow('object');
  });

  test('rejects recognized secrets in host routing fields and accepts approved UUIDs', () => {
    const { context } = makeContext();
    expect(() => validateContext({ ...context, projectId: 'AKIAIOSFODNN7EXAMPLE' })).toThrow(
      EnvelopeError,
    );
    expect(() =>
      validateContext({ ...context, service: 'ghp_abcdefghijklmnopqrstuvwxyz123456' }),
    ).toThrow(EnvelopeError);
    expect(() =>
      validateContext({ ...context, projectId: 'bb7dfb30-af65-42bb-a47b-229fb067ab1d' }),
    ).not.toThrow();
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
      projectId: 'project-1',
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
