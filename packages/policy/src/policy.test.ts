import type { SharedPolicyContext } from '@graveshift/core/policy-context';
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { decide, isRuntimeAction, type PolicyAction, toAuditEvent } from './decide';
import { baseContext, basePolicy } from './fixtures';
import { loadPolicy, parsePolicy, PolicyError } from './load';
import { type Mode, MODES, type Policy, type Rule } from './schema';
import { resolveMode, saferMode } from './mode';

const ACTIONS = ['open_pr', 'restart_service', 'scale', 'rollout_restart'];
const SERVICES = ['api', 'worker', 'postgres'];
const mode = fc.constantFrom<Mode>(...MODES);
const envMode = fc.option(fc.oneof(mode, fc.constant('bogus')), { nil: undefined });

const rule: fc.Arbitrary<Rule> = fc.record({
  id: fc.uuid(),
  action: fc.oneof(fc.constantFrom('*', ...ACTIONS), fc.subarray(ACTIONS, { minLength: 1 })),
  when: fc.option(
    fc.record(
      {
        services: fc.subarray(SERVICES, { minLength: 1 }),
        signals: fc.subarray(['oom_killed', 'x']),
      },
      { requiredKeys: [] },
    ),
    { nil: undefined },
  ),
  effect: fc.constantFrom('allow', 'require_approval', 'deny'),
}) as fc.Arbitrary<Rule>;

const policyArb: fc.Arbitrary<Policy> = fc
  .record({
    mode,
    rules: fc.array(rule, { maxLength: 6 }),
    maxPrs: fc.nat(5),
    maxActions: fc.nat(5),
    loops: fc.nat(5),
    budget: fc.double({ min: 0, max: 5, noNaN: true }),
  })
  .map((p) => ({
    ...basePolicy,
    mode: p.mode,
    rules: p.rules,
    limits: {
      maxOpenPrsPerHour: p.maxPrs,
      maxActionsPerServicePer10Min: p.maxActions,
      maxDiagnosisLoops: p.loops,
      llmDailyBudgetUsd: p.budget,
    },
  }));

const ctxArb: fc.Arbitrary<SharedPolicyContext> = fc.record(
  {
    service: fc.constantFrom(...SERVICES),
    category: fc.constantFrom('code_bug', 'other'),
    signals: fc.subarray(['oom_killed', 'x']),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    envMode,
    counters: fc.record({
      openPrsLastHour: fc.nat(6),
      actionsLast10Min: fc.nat(6),
      diagnosisLoops: fc.nat(6),
      llmSpentTodayUsd: fc.double({ min: 0, max: 6, noNaN: true }),
    }),
  },
  { requiredKeys: ['service', 'signals', 'confidence', 'counters'] },
) as fc.Arbitrary<SharedPolicyContext>;

const actionArb: fc.Arbitrary<PolicyAction> = fc.record({
  name: fc.constantFrom(...ACTIONS),
  params: fc.record({ replicas: fc.nat(5) }),
});

const run = (check: (policy: Policy, ctx: SharedPolicyContext, action: PolicyAction) => void) =>
  fc.assert(fc.property(policyArb, ctxArb, actionArb, check), { numRuns: 500 });

describe('decide properties', () => {
  test('no matching rule implies deny no_matching_rule in every mode', () => {
    run((policy, ctx, action) => {
      const decision = decide({ ...policy, rules: [] }, ctx, action);
      expect(decision.effect).toBe('deny');
      expect(decision.reason).toBe('no_matching_rule');
      expect(decision.matchedRule).toBeNull();
    });
  });

  test('a deny rule on the target service implies deny in every mode and position', () => {
    fc.assert(
      fc.property(policyArb, ctxArb, actionArb, fc.nat(), (policy, ctx, action, at) => {
        const killer: Rule = {
          id: 'killer',
          action: '*',
          when: { services: [ctx.service] },
          effect: 'deny',
        };
        const rules = [...policy.rules];
        rules.splice(at % (rules.length + 1), 0, killer);
        const decision = decide({ ...policy, rules }, ctx, action);
        expect(decision.effect).toBe('deny');
      }),
    );
  });

  test('dry-run never yields allow or require_approval', () => {
    run((policy, ctx, action) => {
      const decision = decide({ ...policy, mode: 'dry-run' }, ctx, action);
      expect(['allow', 'require_approval']).not.toContain(decision.effect);
      expect(decide(policy, { ...ctx, envMode: 'dry-run' }, action).mode).toBe('dry-run');
    });
  });

  test('env override never raises the mode above policy.yaml', () => {
    const rank = (m: Mode) => MODES.indexOf(m);
    run((policy, ctx, action) => {
      const decision = decide(policy, ctx, action);
      expect(rank(decision.mode)).toBeLessThanOrEqual(rank(policy.mode));
    });
  });

  test('runtime actions never return allow in any mode', () => {
    run((policy, ctx, action) => {
      if (isRuntimeAction(action)) expect(decide(policy, ctx, action).effect).not.toBe('allow');
    });
  });

  test('low confidence never yields allow, approval or dry_run', () => {
    run((policy, ctx, action) => {
      const threshold = isRuntimeAction(action)
        ? policy.llm.minConfidenceForAction
        : policy.llm.minConfidenceForPr;
      const decision = decide(policy, { ...ctx, confidence: threshold - 0.01 }, action);
      expect(decision.effect).toBe('deny');
    });
  });

  test('exceeded rate limits imply deny', () => {
    run((policy, ctx, action) => {
      const spent = { ...ctx, counters: { ...ctx.counters, diagnosisLoops: 99 } };
      expect(decide(policy, spent, action).effect).toBe('deny');
    });
  });

  test('decide is deterministic and does not mutate inputs', () => {
    run((policy, ctx, action) => {
      const snapshot = structuredClone([policy, ctx, action]);
      expect(decide(policy, ctx, action)).toEqual(decide(policy, ctx, action));
      expect([policy, ctx, action]).toEqual(snapshot);
    });
  });

  test('audit event carries matchedRule and reasons of the decision', () => {
    run((policy, ctx, action) => {
      const decision = decide(policy, ctx, action);
      const event = toAuditEvent(decision, ctx, action);
      expect(event.payload.matchedRule).toBe(decision.matchedRule);
      expect(event.payload.reasons).toEqual(decision.reasons);
      expect(decision.reasons.length).toBeGreaterThan(0);
    });
  });
});

describe('mode lattice properties', () => {
  const modes = fc.constantFrom<Mode>(...MODES);

  test('saferMode is commutative, idempotent, associative and a lower bound', () => {
    fc.assert(
      fc.property(modes, modes, modes, (a, b, c) => {
        expect(saferMode(a, b)).toBe(saferMode(b, a));
        expect(saferMode(a, a)).toBe(a);
        expect(saferMode(saferMode(a, b), c)).toBe(saferMode(a, saferMode(b, c)));
        expect(MODES.indexOf(saferMode(a, b))).toBeLessThanOrEqual(MODES.indexOf(a));
      }),
    );
  });

  test('resolveMode equals saferMode for valid env values and warns when it clamps', () => {
    fc.assert(
      fc.property(modes, modes, (policyMode, env) => {
        const result = resolveMode(policyMode, env);
        expect(result.mode).toBe(saferMode(policyMode, env));
        expect(result.warning !== undefined).toBe(MODES.indexOf(env) > MODES.indexOf(policyMode));
      }),
    );
    expect(resolveMode('act', 'bogus').warning).toBeDefined();
  });
});

describe('policy behavior', () => {
  const policy = parsePolicy({
    ...basePolicy,
    rules: [
      { id: 'pr', action: 'open_pr', effect: 'allow' },
      {
        id: 'scale',
        action: 'scale',
        when: { services: ['worker'] },
        params: { replicas: { min: 1, max: 3 } },
        effect: 'require_approval',
      },
    ],
  });

  test('open_pr is allowed in propose mode; draft PR is not a runtime action', () => {
    const decision = decide({ ...policy, mode: 'propose' }, baseContext, { name: 'open_pr' });
    expect(decision).toMatchObject({ effect: 'allow', matchedRule: 'pr' });
  });

  test('scale respects replica bounds', () => {
    const ctx = { ...baseContext, service: 'worker' };
    expect(decide(policy, ctx, { name: 'scale', params: { replicas: 2 } }).effect).toBe(
      'require_approval',
    );
    expect(decide(policy, ctx, { name: 'scale', params: { replicas: 9 } }).reason).toBe(
      'no_matching_rule',
    );
  });

  test('env override toward a less safe mode is ignored with a warning', () => {
    const decision = decide(
      { ...policy, mode: 'propose' },
      { ...baseContext, envMode: 'act' },
      { name: 'open_pr' },
    );
    expect(decision.mode).toBe('propose');
    expect(decision.warnings).toHaveLength(1);
  });

  test('rate limit reason is rate_limited and low confidence is low_confidence', () => {
    const limited = { ...baseContext, counters: { ...baseContext.counters, openPrsLastHour: 3 } };
    expect(decide(policy, limited, { name: 'open_pr' }).reason).toBe('rate_limited');
    expect(decide(policy, { ...baseContext, confidence: 0.1 }, { name: 'open_pr' }).reason).toBe(
      'low_confidence',
    );
  });
});

describe('loader', () => {
  test('loads the checked-in policy fixture', async () => {
    const policy = await loadPolicy(`${import.meta.dir}/../fixtures/policy.yaml`);
    expect(policy.rules.map((r) => r.id)).toContain('never-touch-db');
  });

  test('reports every issue with its JSON path', () => {
    try {
      parsePolicy({
        ...basePolicy,
        mode: 'yolo',
        default: 'allow',
        llm: { minConfidenceForPr: 2 },
      });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyError);
      const issues = (error as PolicyError).issues.join('\n');
      expect(issues).toContain('mode:');
      expect(issues).toContain('default:');
      expect(issues).toContain('llm.minConfidenceForPr:');
      expect(issues).toContain('llm.minConfidenceForAction:');
    }
  });

  test('rejects duplicate rule ids and missing files', async () => {
    const dup = { id: 'a', action: '*', effect: 'deny' };
    expect(() => parsePolicy({ ...basePolicy, rules: [dup, dup] })).toThrow('rules[1].id');
    await expect(loadPolicy('/nonexistent/policy.yaml')).rejects.toBeInstanceOf(PolicyError);
  });
});
