import {
  ProtocolError,
  SdkError,
  SdkErrorCode,
  SdkHttpError,
  UnauthorizedError,
} from '@modelcontextprotocol/client';
import { ZodError } from 'zod';

/**
 * Typed failures. Every error this package throws extends `GraveshiftMcpError`.
 * `kind` names the layer that failed and `retryable` says whether the client
 * may try the call again. Callers never need to import SDK error classes.
 */
export type GraveshiftMcpErrorKind =
  | 'config'
  | 'auth'
  | 'transport'
  | 'timeout'
  | 'protocol'
  | 'tool'
  | 'validation';

export interface GraveshiftMcpErrorOptions {
  cause?: unknown;
  retryable?: boolean;
}

/** Base class for every failure this package raises. */
export class GraveshiftMcpError extends Error {
  readonly kind: GraveshiftMcpErrorKind;
  readonly retryable: boolean;

  constructor(
    kind: GraveshiftMcpErrorKind,
    message: string,
    options: GraveshiftMcpErrorOptions = {},
  ) {
    super(message, 'cause' in options ? { cause: options.cause } : undefined);
    this.name = 'GraveshiftMcpError';
    this.kind = kind;
    this.retryable = options.retryable ?? false;
  }
}

/** The token was missing, rejected or without scope. The HTTP endpoint refused the caller. */
export class GraveshiftMcpAuthError extends GraveshiftMcpError {
  readonly status: number | undefined;

  constructor(message: string, options: GraveshiftMcpErrorOptions & { status?: number } = {}) {
    super('auth', message, options);
    this.name = 'GraveshiftMcpAuthError';
    this.status = options.status;
  }
}

/** The transport could not carry the message: connect failure, socket loss or a server 5xx. */
export class GraveshiftMcpTransportError extends GraveshiftMcpError {
  readonly status: number | undefined;

  constructor(message: string, options: GraveshiftMcpErrorOptions & { status?: number } = {}) {
    super('transport', message, { retryable: true, ...options });
    this.name = 'GraveshiftMcpTransportError';
    this.status = options.status;
  }
}

/** A request or connect exceeded its bound. */
export class GraveshiftMcpTimeoutError extends GraveshiftMcpError {
  constructor(message: string, options: GraveshiftMcpErrorOptions = {}) {
    super('timeout', message, { retryable: true, ...options });
    this.name = 'GraveshiftMcpTimeoutError';
  }
}

/** The server answered with a JSON-RPC error, for example unknown primitive or bad params. */
export class GraveshiftMcpProtocolError extends GraveshiftMcpError {
  readonly code: number;
  readonly data: unknown;

  constructor(
    message: string,
    options: GraveshiftMcpErrorOptions & { code: number; data?: unknown },
  ) {
    super('protocol', message, options);
    this.name = 'GraveshiftMcpProtocolError';
    this.code = options.code;
    this.data = options.data;
  }
}

/** A tool ran and refused: the reply carries `isError`. This is a business denial, not a fault. */
export class GraveshiftMcpToolError extends GraveshiftMcpError {
  readonly tool: string;
  readonly text: string;

  constructor(tool: string, text: string, options: GraveshiftMcpErrorOptions = {}) {
    super('tool', `tool ${tool} failed: ${text}`, options);
    this.name = 'GraveshiftMcpToolError';
    this.tool = tool;
    this.text = text;
  }
}

/** A reply or an input did not match the contract in this package. */
export class GraveshiftMcpValidationError extends GraveshiftMcpError {
  readonly issues: unknown;

  constructor(message: string, options: GraveshiftMcpErrorOptions & { issues?: unknown } = {}) {
    super('validation', message, options);
    this.name = 'GraveshiftMcpValidationError';
    this.issues = options.issues;
  }
}

/** The caller built the client wrong: a missing credential or a bad option. */
export class GraveshiftMcpConfigError extends GraveshiftMcpError {
  constructor(message: string) {
    super('config', message);
    this.name = 'GraveshiftMcpConfigError';
  }
}

const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429]);

function isAuthStatus(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

function isRetryableStatus(status: number | undefined): boolean {
  return status !== undefined && (RETRYABLE_HTTP_STATUS.has(status) || status >= 500);
}

/** Map any thrown value, SDK errors included, onto the typed error hierarchy. */
export function toGraveshiftMcpError(error: unknown, fallback: string): GraveshiftMcpError {
  if (error instanceof GraveshiftMcpError) return error;
  if (error instanceof SdkHttpError) {
    const message = `${fallback}: HTTP ${error.status}`;
    if (isAuthStatus(error.status)) {
      return new GraveshiftMcpAuthError(message, { status: error.status, cause: error });
    }
    if (isRetryableStatus(error.status)) {
      return new GraveshiftMcpTransportError(message, { status: error.status, cause: error });
    }
    return new GraveshiftMcpTransportError(message, {
      status: error.status,
      retryable: false,
      cause: error,
    });
  }
  if (error instanceof UnauthorizedError) {
    return new GraveshiftMcpAuthError(`${fallback}: the server refused the bearer token`, {
      status: 401,
      cause: error,
    });
  }
  if (error instanceof ProtocolError) {
    return new GraveshiftMcpProtocolError(`${fallback}: ${error.message}`, {
      code: error.code,
      data: error.data,
      cause: error,
    });
  }
  if (error instanceof SdkError) {
    if (error.code === SdkErrorCode.RequestTimeout) {
      return new GraveshiftMcpTimeoutError(`${fallback}: timed out`, { cause: error });
    }
    if (
      error.code === SdkErrorCode.NotConnected ||
      error.code === SdkErrorCode.ConnectionClosed ||
      error.code === SdkErrorCode.SendFailed
    ) {
      return new GraveshiftMcpTransportError(`${fallback}: ${error.message}`, { cause: error });
    }
    return new GraveshiftMcpProtocolError(`${fallback}: ${error.message}`, {
      code: -32603,
      data: error.code,
      cause: error,
    });
  }
  if (error instanceof ZodError) {
    return new GraveshiftMcpValidationError(`${fallback}: schema mismatch`, {
      issues: error.issues,
      cause: error,
    });
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new GraveshiftMcpTimeoutError(`${fallback}: aborted`, {
        retryable: false,
        cause: error,
      });
    }
    if (error.name === 'TypeError') {
      // fetch reports a dead network as TypeError, for example `fetch failed`.
      return new GraveshiftMcpTransportError(`${fallback}: ${error.message}`, { cause: error });
    }
    if (error.message.includes('Closed connection') || error.message.includes('Not connected')) {
      return new GraveshiftMcpTransportError(`${fallback}: ${error.message}`, { cause: error });
    }
  }
  return new GraveshiftMcpTransportError(`${fallback}: ${String(error)}`, {
    retryable: false,
    cause: error,
  });
}
