import { describe, expect, test } from 'bun:test';

import type { PolicyAction } from './action';
import { decide, type PolicyDecision } from './decide';
import { baseContext, basePolicy } from './fixtures';
import type { Mode, Policy, Rule } from './schema';

/** The one decision matrix. Every case crosses the one `decide` seam. */
const grant: Rule = {
  id: 'restart',
  action: 'rollout_restart',
  when: { services: ['api'] },
  effect: 'require_approval',
};
const runtimePolicy: Policy = { ...basePolicy, rules: [grant] };
const restart: PolicyAction = { name: 'rollout_restart' };

const call = (
  policy: Policy = runtimePolicy,
  context = baseContext,
  action: PolicyAction = restart,
): PolicyDecision => decide(policy, context, action);

describe('one decision matrix', () => {
  test.each([0, 1])('a deny in position %s wins over a runtime grant', (at) => {
    const rules: Rule[] = [grant];
    rules.splice(at, 0, { id: 'deny', action: '*', effect: 'deny' });
    expect(call({ ...runtimePolicy, rules })).toMatchObject({
      effect: 'deny',
      reason: 'deny_rule',
      matchedRule: 'deny',
    });
  });

  test('a wildcard cannot grant a runtime target', () => {
    const rules: Rule[] = [
      { id: 'wildcard', action: '*', effect: 'allow' },
      { id: 'pr', action: 'open_pr', when: { services: ['api'] }, effect: 'allow' },
      { ...grant, when: { services: ['worker'] } },
    ];
    expect(call({ ...runtimePolicy, rules })).toMatchObject({
      effect: 'deny',
      reason: 'target_not_allowlisted',
    });
    expect(
      call(
        { ...runtimePolicy, rules: [{ ...grant, when: { services: ['*'] } }] },
        { ...baseContext, service: '*' },
      ).effect,
    ).toBe('deny');
  });

  test('scale needs a bounded rule and a safe integer replica count', () => {
    const scale: PolicyAction = { name: 'scale', params: { replicas: 2 } };
    const unbounded = { ...grant, action: 'scale' as const };
    expect(call({ ...runtimePolicy, rules: [unbounded] }, baseContext, scale).reason).toBe(
      'unbounded_scale',
    );
    const bounded = { ...unbounded, params: { replicas: { min: 1, max: 3 } } };
    const policy = { ...runtimePolicy, rules: [bounded] };
    expect(call(policy, baseContext, scale)).toMatchObject({
      effect: 'require_approval',
      reason: 'runtime_needs_approval',
    });
    for (const replicas of [0, 4, 1.5, NaN, Infinity]) {
      expect(call(policy, baseContext, { name: 'scale', params: { replicas } }).effect).toBe(
        'deny',
      );
    }
    expect(call(policy, baseContext, { name: 'scale', params: { replicas: 1.5 } }).reason).toBe(
      'invalid_replicas',
    );
    expect(call(policy, baseContext, { name: 'scale' }).effect).toBe('deny');
    expect(
      call(
        { ...runtimePolicy, rules: [{ ...unbounded, params: { replicas: { min: 3, max: 1 } } }] },
        baseContext,
        scale,
      ).effect,
    ).toBe('deny');
  });

  test.each<Mode>(['dry-run', 'propose', 'act'])('runtime respects effective mode %s', (mode) => {
    const byPolicy = call({ ...runtimePolicy, mode });
    const byEnv = call(runtimePolicy, { ...baseContext, envMode: mode });
    expect(byPolicy.effect).toBe(mode === 'act' ? 'require_approval' : 'deny');
    expect(byEnv).toEqual(byPolicy);
    expect(
      call({ ...runtimePolicy, mode: 'propose' }, { ...baseContext, envMode: 'act' }),
    ).toMatchObject({ effect: 'deny', mode: 'propose', reason: 'mode_propose' });
  });

  test('runtime actions never allow, even when the selected rule allows', () => {
    const allow: Rule = { ...grant, effect: 'allow' };
    expect(call({ ...runtimePolicy, rules: [allow] })).toMatchObject({
      effect: 'require_approval',
      reason: 'runtime_needs_approval',
    });
  });

  test('a proposal keeps its dry-run, allow and gate meanings', () => {
    const proposing: Policy = {
      ...basePolicy,
      mode: 'propose',
      rules: [{ id: 'pr', action: 'open_pr', effect: 'allow' }],
    };
    const openPr: PolicyAction = { name: 'open_pr' };
    expect(call(proposing, baseContext, openPr)).toMatchObject({
      effect: 'allow',
      matchedRule: 'pr',
    });
    expect(call({ ...proposing, mode: 'dry-run' }, baseContext, openPr)).toMatchObject({
      effect: 'dry_run',
      reason: 'mode_dry_run',
      matchedRule: 'pr',
    });
    expect(call(proposing, { ...baseContext, confidence: 0.1 }, openPr).reason).toBe(
      'low_confidence',
    );
    expect(
      call(
        proposing,
        { ...baseContext, counters: { ...baseContext.counters, openPrsLastHour: 3 } },
        openPr,
      ).reason,
    ).toBe('rate_limited');
  });

  test('runtime facts apply confidence, limits and deterministic input semantics', () => {
    expect(call(runtimePolicy, { ...baseContext, confidence: 0.1 }).reason).toBe('low_confidence');
    expect(
      call(runtimePolicy, {
        ...baseContext,
        counters: { ...baseContext.counters, actionsLast10Min: 1 },
      }).reason,
    ).toBe('rate_limited');
    const before = structuredClone([runtimePolicy, baseContext, restart]);
    expect(call()).toEqual(call());
    expect([runtimePolicy, baseContext, restart]).toEqual(before);
  });
});
