import { loadGraveshiftConfig } from '@graveshift/config';
import { describe, expect, test } from 'bun:test';

import { evaluateSignedPolicyAllow } from '../scripts/actions/one-shot';
import { signPolicyDecision, verifyPolicySignature } from '../scripts/actions/policy-signature';

const secret = 'test-policy-signing-key-with-at-least-32-chars';
const context = {
  service: 'api',
  category: 'code_bug',
  signals: [],
  confidence: 0.9,
  counters: { openPrsLastHour: 0, actionsLast10Min: 0, diagnosisLoops: 0, llmSpentTodayUsd: 0 },
};
const binding = {
  repository: 'xiro/haunted-candy-shop',
  workItemId: 'wi-123',
  incidentRef: 'diag-123',
  branchSlug: 'graveshift/inc-123-fix',
  baseRef: 'main',
  baseSha: 'a'.repeat(40),
  prTitle: 'Fix API',
  patchPayload: '{"files":[]}',
};
const raw = JSON.stringify({ effect: 'allow', action: 'open_pr', context });

describe('signed policy decision', () => {
  test('verifies a platform signature and rechecks policy using the recorded context', async () => {
    const policy = (await loadGraveshiftConfig()).policy;
    const signed = signPolicyDecision(raw, binding, secret);
    expect(
      evaluateSignedPolicyAllow(signed.policyDecision, signed.signature, secret, binding, policy)
        .effect,
    ).toBe('allow');
    const low = signPolicyDecision(
      JSON.stringify({
        effect: 'allow',
        action: 'open_pr',
        context: { ...context, confidence: 0.1 },
      }),
      binding,
      secret,
    );
    expect(() =>
      evaluateSignedPolicyAllow(low.policyDecision, low.signature, secret, binding, policy),
    ).toThrow(/did not allow/);
  });

  test('rejects unsigned, expired, tampered and differently bound inputs', () => {
    const signed = signPolicyDecision(raw, binding, secret);
    for (const field of Object.keys(binding) as Array<keyof typeof binding>) {
      expect(() =>
        verifyPolicySignature(signed.policyDecision, signed.signature, secret, {
          ...binding,
          [field]: `${binding[field]}-changed`,
        }),
      ).toThrow('does not match');
    }
    expect(() =>
      verifyPolicySignature(signed.policyDecision, undefined, secret, binding),
    ).toThrow();
    expect(() =>
      verifyPolicySignature(signed.policyDecision, signed.signature, undefined, binding),
    ).toThrow();
    expect(() =>
      verifyPolicySignature(
        signed.policyDecision.replace('0.9', '1.0'),
        signed.signature,
        secret,
        binding,
      ),
    ).toThrow('signature is invalid');
    const old = signPolicyDecision(raw, binding, secret, Date.now() - 6 * 60_000);
    expect(() => verifyPolicySignature(old.policyDecision, old.signature, secret, binding)).toThrow(
      'expired',
    );
  });
});
