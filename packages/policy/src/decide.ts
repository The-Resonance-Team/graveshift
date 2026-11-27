import type { SharedPolicyContext } from '@graveshift/core/policy-context';

import { type PolicyAction, isRuntimeAction } from './action';
import { decisionFor, gate, matches } from './evaluation';
import type { Mode, Policy } from './schema';

export type Effect = 'allow' | 'deny' | 'require_approval' | 'dry_run';

export interface PolicyDecision {
  effect: Effect;
  reason: string;
  matchedRule: string | null;
  mode: Mode;
  reasons: string[];
  warnings: string[];
}

/** The three facts that differ between a proposal and a runtime execution. */
export interface DecisionFacts {
  mode: Mode;
  allowlist: readonly string[] | undefined;
  scale: { min: number; max: number } | undefined;
}

/**
 * The one policy decision seam. The fact interface lives in core; the action
 * descriptor and the mode, allowlist and scale facts are explicit here.
 */
export function decide(
  policy: Policy,
  ctx: SharedPolicyContext,
  action: PolicyAction,
): PolicyDecision {
  const { mode, done } = decisionFor(policy, ctx);

  const denied = policy.rules.find((rule) => rule.effect === 'deny' && matches(rule, action, ctx));
  if (denied) return done('deny', 'deny_rule', denied.id);

  const rule = policy.rules.find((candidate) => matches(candidate, action, ctx));
  if (!rule) return done('deny', 'no_matching_rule', null);

  const facts: DecisionFacts = {
    mode,
    allowlist: rule.when?.services,
    scale: rule.params?.replicas,
  };
  if (isRuntimeAction(action)) {
    if (ctx.service === '*' || !facts.allowlist?.includes(ctx.service))
      return done('deny', 'target_not_allowlisted', rule.id);
    if (action.name === 'scale') {
      if (!facts.scale || facts.scale.min > facts.scale.max)
        return done('deny', 'unbounded_scale', rule.id);
      if (!Number.isSafeInteger(action.params?.replicas))
        return done('deny', 'invalid_replicas', rule.id);
    }
  }

  const gated = gate(policy, action, ctx);
  if (gated) return done('deny', gated, rule.id);

  if (isRuntimeAction(action)) {
    if (facts.mode !== 'act')
      return done('deny', `mode_${facts.mode === 'dry-run' ? 'dry_run' : facts.mode}`, rule.id);
    // Runtime actions always need a human approval, even in act mode.
    return done('require_approval', 'runtime_needs_approval', rule.id, [`rule:${rule.id}`]);
  }
  if (facts.mode === 'dry-run')
    return done('dry_run', 'mode_dry_run', rule.id, [`rule:${rule.id}`]);
  return done(rule.effect === 'deny' ? 'deny' : rule.effect, `rule:${rule.id}`, rule.id);
}

export function toAuditEvent(
  decision: PolicyDecision,
  ctx: SharedPolicyContext,
  action: PolicyAction,
) {
  return {
    actor: 'policy',
    type: 'policy.decision',
    payload: {
      effect: decision.effect,
      mode: decision.mode,
      matchedRule: decision.matchedRule,
      reasons: decision.reasons,
      warnings: decision.warnings,
      action: action.name,
      service: ctx.service,
    },
  };
}
