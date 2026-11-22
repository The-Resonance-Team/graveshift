import { GraveshiftMcpError, toGraveshiftMcpError } from './errors';

/**
 * Bounded retry with exponential backoff. The client owns the retry; the MCP
 * SDK does not retry its requests. Only errors marked `retryable` are tried
 * again, and the attempt count never exceeds `maxRetries` extra tries.
 */
export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/** Defaults and hard bounds. A caller can ask for less, never for more. */
export const DEFAULT_MAX_RETRIES = 2;
export const MAX_RETRIES_CEILING = 5;
export const DEFAULT_RETRY_BASE_DELAY_MS = 250;
export const RETRY_BASE_DELAY_CEILING_MS = 2_000;
export const DEFAULT_RETRY_MAX_DELAY_MS = 5_000;
export const RETRY_DELAY_CEILING_MS = 10_000;

export interface RetryInput {
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Clamp the caller's retry knobs into the bounded range. */
export function normalizeRetryPolicy(input: RetryInput = {}): RetryPolicy {
  return {
    maxRetries: clampInt(input.maxRetries, DEFAULT_MAX_RETRIES, 0, MAX_RETRIES_CEILING),
    baseDelayMs: clampInt(
      input.retryBaseDelayMs,
      DEFAULT_RETRY_BASE_DELAY_MS,
      0,
      RETRY_BASE_DELAY_CEILING_MS,
    ),
    maxDelayMs: clampInt(
      input.retryMaxDelayMs,
      DEFAULT_RETRY_MAX_DELAY_MS,
      0,
      RETRY_DELAY_CEILING_MS,
    ),
  };
}

export function retryDelayMs(policy: RetryPolicy, attempt: number): number {
  const grown = policy.baseDelayMs * 2 ** attempt;
  return Math.min(policy.maxDelayMs, Math.max(0, Math.round(grown)));
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryHooks {
  onRetry?: (attempt: number, error: GraveshiftMcpError) => void;
}

/**
 * Run `operation` until it succeeds, until the error is not retryable, or
 * until the bounded retries are used up. `label` names the call in errors.
 * Recursion keeps one attempt per stack frame; the depth is bounded by
 * `maxRetries`.
 */
export async function withRetry<T>(
  policy: RetryPolicy,
  label: string,
  operation: (attempt: number) => Promise<T>,
  hooks: RetryHooks = {},
): Promise<T> {
  const attemptOnce = async (attempt: number): Promise<T> => {
    try {
      return await operation(attempt);
    } catch (error) {
      const mapped = toGraveshiftMcpError(error, label);
      if (!mapped.retryable || attempt >= policy.maxRetries) throw mapped;
      hooks.onRetry?.(attempt + 1, mapped);
      await sleep(retryDelayMs(policy, attempt));
      return attemptOnce(attempt + 1);
    }
  };
  return attemptOnce(0);
}
