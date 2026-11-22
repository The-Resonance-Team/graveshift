import { decisionFor, gate, matches } from './evaluation';
import type { Mode, Policy } from './schema';

export type Effect = 'allow' | 'deny' | 'require_approval' | 'dry_run';

export interface PolicyAction {
  name: string;
  params?: { replicas?: number };
}

export interface PolicyContext {
  service: string;
  category?: string;
  signals: string[];
  confidence: number;
  envMode?: string;
  counters: {
    openPrsLastHour: number;
    actionsLast10Min: number;
    diagnosisLoops: number;
    llmSpentTodayUsd: number;
  };
}

export interface PolicyDecision {
  effect: Effect;
  reason: string;
  matchedRule: string | null;
  mode: Mode;
  reasons: string[];
  warnings: string[];
}

export const isRuntimeAction = (action: PolicyAction): boolean => action.name !== 'open_pr';

export function decide(policy: Policy, ctx: PolicyContext, action: PolicyAction): PolicyDecision {
  const { mode, done } = decisionFor(policy, ctx);

  const denied = policy.rules.find((rule) => rule.effect === 'deny' && matches(rule, action, ctx));
  if (denied) return done('deny', 'deny_rule', denied.id);

  const rule = policy.rules.find((candidate) => matches(candidate, action, ctx));
  if (!rule) return done('deny', 'no_matching_rule', null);

  const gated = gate(policy, action, ctx);
  if (gated) return done('deny', gated, rule.id);

  if (mode === 'dry-run') return done('dry_run', 'mode_dry_run', rule.id, [`rule:${rule.id}`]);
  // runtime actions always need a human approval, even in act mode (safety invariant 1)
  if (isRuntimeAction(action) && rule.effect === 'allow') {
    return done('require_approval', 'runtime_needs_approval', rule.id, [`rule:${rule.id}`]);
  }
  return done(rule.effect === 'deny' ? 'deny' : rule.effect, `rule:${rule.id}`, rule.id);
}

export function toAuditEvent(decision: PolicyDecision, ctx: PolicyContext, action: PolicyAction) {
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
