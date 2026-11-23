import { describe, expect, test } from 'bun:test';

import { PolicyContextMismatchError } from './mcp.errors';

describe('PolicyContextMismatchError', () => {
  test('keeps the message and carries a stable wire code', () => {
    const error = new PolicyContextMismatchError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PolicyContextMismatchError');
    expect(error.code).toBe('POLICY_CONTEXT_MISMATCH');
    expect(error.message).toBe('Policy facts do not match this Haunting');
  });
});
