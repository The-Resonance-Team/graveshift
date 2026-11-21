import { createInMemoryPublisher, type InMemoryPublisher } from '@graveshift/events/testing';
import type { Clock, Context } from '@graveshift/integrations';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { expect } from 'bun:test';
import { of, type Observable, throwError } from 'rxjs';

export type Request = {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
};

export type Middleware = (
  request: Request,
  response: { statusCode?: number; on(event: string, listener: () => void): unknown },
  next: () => void,
) => void;

export function makeClock(): Clock {
  let count = 0;
  return {
    now: () => '2026-11-20T10:00:00.000Z',
    newId: () => `id-${++count}`,
  };
}

export function makeContext(): { context: Context; publisher: InMemoryPublisher } {
  const publisher = createInMemoryPublisher();
  return {
    context: { publisher, tenantId: 'tenant-1', service: 'api' },
    publisher,
  };
}

export function makeApp() {
  const middlewares: Middleware[] = [];
  const interceptors: NestInterceptor[] = [];
  return {
    middlewares,
    interceptors,
    app: {
      use(...args: unknown[]) {
        const handler = args[0];
        if (typeof handler === 'function') middlewares.push(handler as Middleware);
        return this;
      },
      useGlobalInterceptors(...items: NestInterceptor[]) {
        interceptors.push(...items);
        return this;
      },
    },
  };
}

export function finishRequest(middleware: Middleware, request: Request, statusCode = 200): void {
  const listeners: Record<string, Array<() => void>> = {};
  const response = {
    statusCode,
    on(event: string, listener: () => void) {
      (listeners[event] ??= []).push(listener);
      return this;
    },
  };
  let nextCalled = false;
  middleware(request, response, () => {
    nextCalled = true;
  });
  expect(nextCalled).toBe(true);
  for (const listener of listeners['finish'] ?? []) listener();
}

function hostFor(request: Request): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

/**
 * Close approximation of Nest's router: the interceptor wraps the handler
 * observable; when it errors, Nest's exception layer writes a 500 response.
 * A filter that swallows the error would leave that response unwritten.
 */
export async function dispatch(
  interceptor: NestInterceptor,
  request: Request,
  outcome: { kind: 'ok' } | { kind: 'error'; error: Error },
): Promise<{ status: number; body: string }> {
  const source$: Observable<unknown> =
    outcome.kind === 'error' ? throwError(() => outcome.error) : of({ ok: true });
  const result = interceptor.intercept(hostFor(request), {
    handle: () => source$,
  } as CallHandler);
  const result$: Observable<unknown> = result instanceof Promise ? await result : result;
  const response = { status: 200, body: 'ok' };
  let handled: unknown;
  result$.subscribe({
    error: (error: unknown) => {
      handled = error;
      response.status = 500;
      response.body = 'Internal server error';
    },
  });
  if (outcome.kind === 'error') expect(handled).toBe(outcome.error);
  return response;
}
