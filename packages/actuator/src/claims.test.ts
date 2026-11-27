import { expect, test } from 'bun:test';

import { claimAudit, requestHash, runtimeClaim } from './claims';
import { signed } from './test-helpers';

test('the durable hash covers every signed field and the signature with stable key ordering', () => {
  const input = signed();
  const expected = requestHash(input);
  const reordered = {
    context: input.context,
    signature: input.signature,
    approval: input.approval,
    action: input.action,
  };
  expect(requestHash(reordered)).toBe(expected);
  expect(requestHash({ ...input, signature: '0'.repeat(64) })).not.toBe(expected);
  expect(requestHash(signed({ tokenId: 'other' }))).not.toBe(expected);
  expect(requestHash(signed({ confidence: 0.8 }))).not.toBe(expected);
  expect(claimAudit(runtimeClaim(input)).key).toBe(`actuator:${expected}:admission`);
});
