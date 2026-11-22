import type { PolicyAction, PolicyContext, PolicyDecision } from './decide';
import { decisionFor, gate, matches } from './evaluation';
import type { Policy } from './schema';

export interface RuntimeAction extends PolicyAction {
  name: 'restart_service' | 'rollout_restart' | 'scale';
}

export function decideRuntime(
  policy: Policy,
  ctx: PolicyContext,
  action: RuntimeAction,
): PolicyDecision {
  const { mode, done } = decisionFor(policy, ctx);
  const denied = policy.rules.find((rule) => rule.effect === 'deny' && matches(rule, action, ctx));
  if (denied) return done('deny', 'deny_rule', denied.id);

  const rule = policy.rules.find((candidate) => matches(candidate, action, ctx));
  if (!rule) return done('deny', 'no_matching_rule', null);
  if (ctx.service === '*' || !rule.when?.services?.includes(ctx.service)) {
    return done('deny', 'target_not_allowlisted', rule.id);
  }
  if (action.name === 'scale') {
    const bounds = rule.params?.replicas;
    if (!bounds || bounds.min > bounds.max) return done('deny', 'unbounded_scale', rule.id);
    if (!Number.isSafeInteger(action.params?.replicas)) {
      return done('deny', 'invalid_replicas', rule.id);
    }
  }
  const gated = gate(policy, action, ctx);
  if (gated) return done('deny', gated, rule.id);
  if (mode !== 'act') return done('deny', `mode_${mode === 'dry-run' ? 'dry_run' : mode}`, rule.id);
  return done('require_approval', 'runtime_needs_approval', rule.id, [`rule:${rule.id}`]);
}
