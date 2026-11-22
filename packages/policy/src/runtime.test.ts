import { describe, expect, test } from 'bun:test';

import { decide } from './decide';
import { baseContext, basePolicy } from './fixtures';
import { decideRuntime } from './runtime';
import type { Mode, Rule } from './schema';

const restart = { name: 'rollout_restart' } as const;
const grant: Rule = {
  id: 'restart',
  action: 'rollout_restart',
  when: { services: ['api'] },
  effect: 'require_approval',
};
const policy = { ...basePolicy, rules: [grant] };

describe('runtime eligibility', () => {
  test.each([0, 1])('a deny in position %s wins over a named grant', (at) => {
    const rules = [grant];
    rules.splice(at, 0, { id: 'deny', action: '*', effect: 'deny' });
    expect(decideRuntime({ ...policy, rules }, baseContext, restart)).toMatchObject({
      effect: 'deny',
      reason: 'deny_rule',
      matchedRule: 'deny',
    });
  });

  test('a wildcard cannot grant a target, even if an unrelated rule names it', () => {
    const rules: Rule[] = [
      { id: 'wildcard', action: '*', effect: 'allow' },
      { id: 'pr', action: 'open_pr', when: { services: ['api'] }, effect: 'allow' },
      { ...grant, when: { services: ['worker'] } },
    ];
    expect(decideRuntime({ ...policy, rules }, baseContext, restart)).toMatchObject({
      effect: 'deny',
      reason: 'target_not_allowlisted',
    });
    expect(
      decideRuntime(
        { ...policy, rules: [{ ...grant, when: { services: ['*'] } }] },
        { ...baseContext, service: '*' },
        restart,
      ).effect,
    ).toBe('deny');
  });

  test('scale requires bounds on its selected named rule', () => {
    const rule: Rule = { ...grant, action: 'scale' };
    const scale = { name: 'scale', params: { replicas: 2 } } as const;
    expect(decideRuntime({ ...policy, rules: [rule] }, baseContext, scale).reason).toBe(
      'unbounded_scale',
    );
    const bounded = { ...rule, params: { replicas: { min: 1, max: 3 } } };
    const rules = [bounded];
    expect(decideRuntime({ ...policy, rules }, baseContext, scale).effect).toBe('require_approval');
    for (const replicas of [0, 4, 1.5, NaN, Infinity]) {
      expect(
        decideRuntime({ ...policy, rules }, baseContext, {
          name: 'scale',
          params: { replicas },
        }).effect,
      ).toBe('deny');
    }
    expect(decideRuntime({ ...policy, rules }, baseContext, { name: 'scale' }).effect).toBe('deny');
    expect(
      decideRuntime(
        { ...policy, rules: [{ ...rule, params: { replicas: { min: 3, max: 1 } } }] },
        baseContext,
        scale,
      ).effect,
    ).toBe('deny');
  });

  test.each<Mode>(['dry-run', 'propose', 'act'])('execution respects effective mode %s', (mode) => {
    const byPolicy = decideRuntime({ ...policy, mode }, baseContext, restart);
    const byEnv = decideRuntime(policy, { ...baseContext, envMode: mode }, restart);
    expect(byPolicy.effect).toBe(mode === 'act' ? 'require_approval' : 'deny');
    expect(byEnv.effect).toBe(byPolicy.effect);
    expect(
      decideRuntime({ ...policy, mode: 'propose' }, { ...baseContext, envMode: 'act' }, restart),
    ).toMatchObject({ effect: 'deny', mode: 'propose', reason: 'mode_propose' });
  });

  test('proposals and PRs retain their existing meaning in propose mode', () => {
    const proposing = { ...policy, mode: 'propose' as const };
    expect(decide(proposing, baseContext, restart).effect).toBe('require_approval');
    expect(
      decide(
        { ...proposing, rules: [{ id: 'pr', action: 'open_pr', effect: 'allow' }] },
        baseContext,
        { name: 'open_pr' },
      ).effect,
    ).toBe('allow');
  });

  test('runtime policy applies confidence, limits and deterministic input semantics', () => {
    expect(decideRuntime(policy, { ...baseContext, confidence: 0.1 }, restart).reason).toBe(
      'low_confidence',
    );
    expect(
      decideRuntime(
        policy,
        { ...baseContext, counters: { ...baseContext.counters, actionsLast10Min: 1 } },
        restart,
      ).reason,
    ).toBe('rate_limited');
    const before = structuredClone([policy, baseContext, restart]);
    expect(decideRuntime(policy, baseContext, restart)).toEqual(
      decideRuntime(policy, baseContext, restart),
    );
    expect([policy, baseContext, restart]).toEqual(before);
  });
});
