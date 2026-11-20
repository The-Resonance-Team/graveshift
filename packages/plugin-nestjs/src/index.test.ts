import { EventEnvelopeSchema } from '@graveshift/core';
import { HttpException } from '@nestjs/common';
import { describe, expect, test } from 'bun:test';

import { init } from './index';
import { dispatch, finishRequest, makeApp, makeClock, makeContext } from './test-helpers';

describe('NestJS plugin', () => {
  test('publishes one telemetry envelope per finished request', () => {
    const { app, middlewares } = makeApp();
    const { context, publisher } = makeContext();
    init(app, makeClock()).start(context);

    finishRequest(middlewares[0]!, {
      method: 'GET',
      url: '/healthz?token=secret',
      headers: { 'x-trace-id': 'trace-from-client' },
    });

    expect(publisher.envelopes).toHaveLength(1);
    const [envelope] = publisher.envelopes;
    expect(envelope).toBeDefined();
    expect(() => EventEnvelopeSchema.parse(envelope)).not.toThrow();
    expect(envelope).toMatchObject({
      tenantId: 'tenant-1',
      service: 'api',
      source: 'nestjs_plugin',
      type: 'http.request',
      severity: 'info',
      traceId: 'trace-from-client',
      fingerprint: 'http_GET_healthz',
    });
    expect(envelope?.payload).toMatchObject({
      method: 'GET',
      path: '/healthz',
      status: 200,
    });
    expect(JSON.stringify(envelope)).not.toContain('secret');
  });

  test('generates a trace id when the request has no trace header', () => {
    const { app, middlewares } = makeApp();
    const { context, publisher } = makeContext();
    init(app, makeClock()).start(context);

    finishRequest(middlewares[0]!, { method: 'GET', url: '/healthz' });

    expect(publisher.envelopes[0]?.traceId).toBe('id-1');
  });

  test('shares the generated trace id with the error envelope', async () => {
    const { app, middlewares, interceptors } = makeApp();
    const { context, publisher } = makeContext();
    init(app, makeClock()).start(context);

    const request = { method: 'GET', url: '/shared' };
    finishRequest(middlewares[0]!, request);
    await dispatch(interceptors[0]!, request, { kind: 'error', error: new Error('boom') });

    expect(publisher.envelopes).toHaveLength(2);
    expect(publisher.envelopes[0]?.traceId).toBe('id-1');
    expect(publisher.envelopes[1]?.traceId).toBe(publisher.envelopes[0]?.traceId);
  });

  test('redacts and bounds the trace header, falling back when it is unsafe', () => {
    const { app, middlewares } = makeApp();
    const { context, publisher } = makeContext();
    init(app, makeClock()).start(context);

    finishRequest(middlewares[0]!, {
      method: 'GET',
      url: '/a',
      headers: { 'x-trace-id': 'user@example.com' },
    });
    expect(publisher.envelopes[0]?.traceId).toBe('id-1');

    finishRequest(middlewares[0]!, {
      method: 'GET',
      url: '/b',
      headers: { 'x-trace-id': 'a'.repeat(200) },
    });
    expect(publisher.envelopes[1]?.traceId).toBe('a'.repeat(128));
  });

  test('keeps request fingerprint cardinality low for identifier paths', () => {
    const { app, middlewares } = makeApp();
    const { context, publisher } = makeContext();
    init(app, makeClock()).start(context);

    finishRequest(middlewares[0]!, { method: 'GET', url: '/users/123' });
    finishRequest(middlewares[0]!, { method: 'GET', url: '/users/456' });

    expect(publisher.envelopes[0]?.fingerprint).toBe('http_GET_users__id');
    expect(publisher.envelopes[1]?.fingerprint).toBe('http_GET_users__id');
  });

  test('passes a successful handler result through untouched', async () => {
    const { app, interceptors } = makeApp();
    const { context, publisher } = makeContext();
    init(app, makeClock()).start(context);

    const response = await dispatch(
      interceptors[0]!,
      { method: 'GET', url: '/healthz' },
      { kind: 'ok' },
    );

    expect(response).toEqual({ status: 200, body: 'ok' });
    expect(publisher.envelopes).toHaveLength(0);
  });

  test('rethrows an unhandled error so the host still writes a response', async () => {
    const { app, interceptors } = makeApp();
    const { context, publisher } = makeContext();
    init(app, makeClock()).start(context);

    const response = await dispatch(
      interceptors[0]!,
      { method: 'GET', url: '/fail', headers: { 'x-trace-id': 'trace-err' } },
      { kind: 'error', error: new Error('boom') },
    );

    expect(response).toEqual({ status: 500, body: 'Internal server error' });
    expect(publisher.envelopes).toHaveLength(1);
    const [envelope] = publisher.envelopes;
    expect(() => EventEnvelopeSchema.parse(envelope)).not.toThrow();
    expect(envelope).toMatchObject({
      tenantId: 'tenant-1',
      service: 'api',
      source: 'nestjs_plugin',
      type: 'http.error',
      severity: 'critical',
      traceId: 'trace-err',
      fingerprint: 'error_Error_GET_fail',
    });
    expect(envelope?.payload).toMatchObject({
      method: 'GET',
      path: '/fail',
      message: 'boom',
    });
  });

  test('derives the error fingerprint from the exception name', async () => {
    const { app, interceptors } = makeApp();
    const { context, publisher } = makeContext();
    init(app, makeClock()).start(context);

    await dispatch(
      interceptors[0]!,
      { method: 'GET', url: '/fail' },
      { kind: 'error', error: new TypeError('bad type') },
    );

    expect(publisher.envelopes[0]?.fingerprint).toBe('error_TypeError_GET_fail');
  });

  test('maps client errors to info and server errors to critical', async () => {
    const { app, interceptors } = makeApp();
    const { context, publisher } = makeContext();
    init(app, makeClock()).start(context);

    await dispatch(
      interceptors[0]!,
      { method: 'GET', url: '/missing' },
      { kind: 'error', error: new HttpException('missing', 404) },
    );
    await dispatch(
      interceptors[0]!,
      { method: 'GET', url: '/broken' },
      { kind: 'error', error: new HttpException('broken', 503) },
    );

    expect(publisher.envelopes.map((envelope) => envelope.severity)).toEqual(['info', 'critical']);
  });

  test('redacts the path and message and never logs the raw error', async () => {
    const { app, middlewares, interceptors } = makeApp();
    const { context, publisher } = makeContext();
    init(app, makeClock()).start(context);

    const logs: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      finishRequest(middlewares[0]!, {
        method: 'GET',
        url: '/users?DB_PASSWORD=hunter22&x=1',
      });
      await dispatch(
        interceptors[0]!,
        { method: 'GET', url: '/users?API_KEY=abc123' },
        { kind: 'error', error: new Error('failed for ops@example.com with Bearer abcdef123456') },
      );
    } finally {
      console.error = original;
    }

    const text = JSON.stringify(publisher.envelopes);
    expect(text).toContain('[REDACTED:');
    for (const secret of [
      'hunter22',
      'abc123',
      'ops@example.com',
      'abcdef123456',
      '?DB_PASSWORD',
      '?API_KEY',
    ]) {
      expect(text).not.toContain(secret);
    }
    for (const args of logs) {
      for (const arg of args) expect(String(arg)).not.toContain('ops@example.com');
    }
  });

  test('start, stop, start publishes only through the newest handlers', async () => {
    const { app, middlewares, interceptors } = makeApp();
    const { context, publisher } = makeContext();
    const plugin = init(app, makeClock());

    plugin.start(context);
    expect(middlewares).toHaveLength(1);
    plugin.stop();
    plugin.start(context);
    expect(middlewares).toHaveLength(2);
    expect(interceptors).toHaveLength(2);

    for (const middleware of middlewares) {
      finishRequest(middleware, { method: 'GET', url: '/healthz' });
    }
    expect(publisher.envelopes).toHaveLength(1);

    await Promise.all(
      interceptors.map((interceptor) =>
        dispatch(
          interceptor,
          { method: 'GET', url: '/boom' },
          {
            kind: 'error',
            error: new Error('boom'),
          },
        ),
      ),
    );
    expect(publisher.envelopes).toHaveLength(2);
  });

  test('stop disables publishing without detaching handlers', () => {
    const { app, middlewares } = makeApp();
    const { context, publisher } = makeContext();
    const plugin = init(app, makeClock());

    expect(publisher.envelopes).toHaveLength(0);
    expect(middlewares).toHaveLength(0);

    plugin.start(context);
    finishRequest(middlewares[0]!, { method: 'GET', url: '/healthz' });
    expect(publisher.envelopes).toHaveLength(1);

    plugin.stop();
    finishRequest(middlewares[0]!, { method: 'GET', url: '/healthz' });
    expect(publisher.envelopes).toHaveLength(1);
    expect(middlewares).toHaveLength(1);
  });

  test('rejects a bad context at start and fails open on publish errors', async () => {
    const { app, middlewares } = makeApp();
    const { context } = makeContext();
    const plugin = init(app, makeClock());

    expect(() => plugin.start({ ...context, tenantId: 'bad tenant' })).toThrow('tenantId');
    expect(middlewares).toHaveLength(0);

    const sync = {
      ...context,
      publisher: {
        publish: () => {
          throw new Error('broker down');
        },
      },
    };
    plugin.start(sync);
    expect(() => finishRequest(middlewares[0]!, { method: 'GET', url: '/healthz' })).not.toThrow();

    const other = makeApp();
    init(other.app, makeClock()).start({
      ...context,
      publisher: { publish: () => Promise.reject(new Error('broker down')) },
    });
    expect(() =>
      finishRequest(other.middlewares[0]!, { method: 'GET', url: '/healthz' }),
    ).not.toThrow();
    await Promise.resolve();
  });
});
