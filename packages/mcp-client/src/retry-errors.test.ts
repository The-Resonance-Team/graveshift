import { SdkError, SdkErrorCode, SdkHttpError, ProtocolError } from '@modelcontextprotocol/client';
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import {
  GraveshiftMcpAuthError,
  GraveshiftMcpError,
  GraveshiftMcpProtocolError,
  GraveshiftMcpTimeoutError,
  GraveshiftMcpTransportError,
  GraveshiftMcpValidationError,
  toGraveshiftMcpError,
} from './errors';
import { MAX_RETRIES_CEILING, normalizeRetryPolicy, retryDelayMs, withRetry } from './retry';

/** SDK errors are built with the same pinned SDK the client uses. */
function httpError(status: number): SdkHttpError {
  return new SdkHttpError(SdkErrorCode.ClientHttpFailedToOpenStream, `HTTP ${String(status)}`, {
    status,
  });
}

describe('typed error mapping', () => {
  test('a 401 becomes a non-retryable auth error', () => {
    const mapped = toGraveshiftMcpError(httpError(401), 'call');
    expect(mapped).toBeInstanceOf(GraveshiftMcpAuthError);
    expect(mapped.retryable).toBe(false);
  });

  test('a 403 becomes a non-retryable auth error', () => {
    const mapped = toGraveshiftMcpError(httpError(403), 'call');
    expect(mapped).toBeInstanceOf(GraveshiftMcpAuthError);
  });

  test('a 5xx becomes a retryable transport error', () => {
    const mapped = toGraveshiftMcpError(httpError(503), 'call');
    expect(mapped).toBeInstanceOf(GraveshiftMcpTransportError);
    expect(mapped.retryable).toBe(true);
  });

  test('a 400 is a transport error without retry', () => {
    const mapped = toGraveshiftMcpError(httpError(400), 'call');
    expect(mapped).toBeInstanceOf(GraveshiftMcpTransportError);
    expect(mapped.retryable).toBe(false);
  });

  test('a JSON-RPC error keeps its code', () => {
    const mapped = toGraveshiftMcpError(new ProtocolError(-32002, 'resource not found'), 'call');
    expect(mapped).toBeInstanceOf(GraveshiftMcpProtocolError);
    expect((mapped as GraveshiftMcpProtocolError).code).toBe(-32002);
    expect(mapped.retryable).toBe(false);
  });

  test('an SDK timeout becomes a retryable timeout error', () => {
    const mapped = toGraveshiftMcpError(
      new SdkError(SdkErrorCode.RequestTimeout, 'timed out'),
      'call',
    );
    expect(mapped).toBeInstanceOf(GraveshiftMcpTimeoutError);
    expect(mapped.retryable).toBe(true);
  });

  test('a zod failure becomes a validation error', () => {
    const issue = z.object({ a: z.string() }).safeParse({ a: 1 });
    expect(!issue.success).toBe(true);
    const mapped = issue.success ? null : toGraveshiftMcpError(issue.error, 'call');
    expect(mapped).toBeInstanceOf(GraveshiftMcpValidationError);
    expect(mapped?.retryable).toBe(false);
  });

  test('a fetch TypeError is retryable, an unknown error is not', () => {
    const network = toGraveshiftMcpError(new TypeError('fetch failed'), 'call');
    expect(network).toBeInstanceOf(GraveshiftMcpTransportError);
    expect(network.retryable).toBe(true);
    const unknown = toGraveshiftMcpError(new Error('who knows'), 'call');
    expect(unknown.retryable).toBe(false);
  });

  test('every mapped error is a GraveshiftMcpError', () => {
    expect(toGraveshiftMcpError('a string', 'call')).toBeInstanceOf(GraveshiftMcpError);
  });
});

describe('bounded retry', () => {
  test('options clamp into the bounded range', () => {
    const policy = normalizeRetryPolicy({
      maxRetries: 99,
      retryBaseDelayMs: 99_999,
      retryMaxDelayMs: 99_999,
    });
    expect(policy.maxRetries).toBe(MAX_RETRIES_CEILING);
    expect(policy.baseDelayMs).toBeLessThanOrEqual(2_000);
    expect(policy.maxDelayMs).toBeLessThanOrEqual(10_000);
  });

  test('backoff grows but never exceeds the bound', () => {
    const policy = normalizeRetryPolicy({ retryBaseDelayMs: 1_000, retryMaxDelayMs: 3_000 });
    expect(retryDelayMs(policy, 0)).toBe(1_000);
    expect(retryDelayMs(policy, 5)).toBe(3_000);
  });

  test('retryable errors are retried up to the bound', async () => {
    let calls = 0;
    const result = await withRetry(
      normalizeRetryPolicy({ maxRetries: 2, retryBaseDelayMs: 0 }),
      'test',
      async () => {
        calls += 1;
        if (calls < 3) throw new GraveshiftMcpError('transport', 'down', { retryable: true });
        return 'ok';
      },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  test('non-retryable errors fail on the first attempt', async () => {
    let calls = 0;
    const error = await withRetry(
      normalizeRetryPolicy({ maxRetries: 5, retryBaseDelayMs: 0 }),
      'test',
      async () => {
        calls += 1;
        throw new GraveshiftMcpError('protocol', 'denied');
      },
    ).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(GraveshiftMcpError);
    expect(calls).toBe(1);
  });
});
