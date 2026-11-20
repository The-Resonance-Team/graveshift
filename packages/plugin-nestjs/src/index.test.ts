import { EventEnvelopeSchema } from '@graveshift/core';
import { createInMemoryPublisher, type InMemoryPublisher } from '@graveshift/events/testing';
import type { Clock, Context } from '@graveshift/integrations';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { describe, expect, test } from 'bun:test';

import { init } from './index';

type Middleware = (
  req: { method?: string; url?: string },
  res: { statusCode?: number; on(event: string, listener: () => void): unknown },
  next: () => void,
) => void;

function makeClock(): Clock {
  let count = 0;
  return {
    now: () => '2026-11-20T10:00:00.000Z',
    newId: () => `id-${++count}`,
  };
}

function makeContext(): { context: Context; publisher: InMemoryPublisher } {
  const publisher = createInMemoryPublisher();
  return {
    context: { publisher, tenantId: 'tenant-1', service: 'api' },
    publisher,
  };
}

function makeApp() {
  const middlewares: Middleware[] = [];
  const filters: ExceptionFilter[] = [];
  return {
    middlewares,
    filters,
    app: {
      use(...args: unknown[]) {
        const handler = args[0];
        if (typeof handler === 'function') middlewares.push(handler as Middleware);
        return this;
      },
      useGlobalFilters(...items: ExceptionFilter[]) {
        filters.push(...items);
        return this;
      },
    },
  };
}

function simulateRequest(middleware: Middleware, path: string): boolean {
  const listeners: Record<string, Array<() => void>> = {};
  const res = {
    statusCode: 200,
    on(event: string, listener: () => void) {
      (listeners[event] ??= []).push(listener);
      return this;
    },
  };
  let nextCalled = false;
  middleware({ method: 'GET', url: path }, res, () => {
    nextCalled = true;
  });
  for (const listener of listeners['finish'] ?? []) listener();
  return nextCalled;
}

function throwError(filter: ExceptionFilter, path: string): void {
  filter.catch(new Error('boom'), {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', url: path }),
    }),
  } as unknown as ArgumentsHost);
}

describe('NestJS plugin', () => {
  test('publishes one telemetry envelope per finished request', () => {
    const { app, middlewares, filters } = makeApp();
    const { context, publisher } = makeContext();
    const plugin = init(app, makeClock());

    plugin.start(context);
    expect(middlewares).toHaveLength(1);
    expect(filters).toHaveLength(1);

    const nextCalled = simulateRequest(middlewares[0]!, '/healthz');
    expect(nextCalled).toBe(true);

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
      fingerprint: 'http_request',
    });
    expect(envelope?.payload).toMatchObject({
      method: 'GET',
      path: '/healthz',
      status: 200,
    });
  });

  test('publishes one detection envelope for an unhandled error', () => {
    const { app, filters } = makeApp();
    const { context, publisher } = makeContext();
    init(app, makeClock()).start(context);

    throwError(filters[0]!, '/boom');

    expect(publisher.envelopes).toHaveLength(1);
    const [envelope] = publisher.envelopes;
    expect(envelope).toBeDefined();
    expect(() => EventEnvelopeSchema.parse(envelope)).not.toThrow();
    expect(envelope).toMatchObject({
      tenantId: 'tenant-1',
      service: 'api',
      source: 'nestjs_plugin',
      type: 'http.error',
      severity: 'critical',
      fingerprint: 'unhandled_error',
    });
    expect(envelope?.payload).toMatchObject({
      method: 'GET',
      path: '/boom',
      message: 'boom',
    });
  });

  test('no publish happens before start() or after stop()', () => {
    const { app, middlewares, filters } = makeApp();
    const { context, publisher } = makeContext();
    const plugin = init(app, makeClock());

    expect(publisher.envelopes).toHaveLength(0);
    expect(middlewares).toHaveLength(0);
    expect(filters).toHaveLength(0);

    plugin.start(context);
    simulateRequest(middlewares[0]!, '/healthz');
    expect(publisher.envelopes).toHaveLength(1);

    plugin.stop();
    simulateRequest(middlewares[0]!, '/healthz');
    throwError(filters[0]!, '/boom');
    expect(publisher.envelopes).toHaveLength(1);
  });
});
