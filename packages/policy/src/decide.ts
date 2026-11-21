import { resolveMode } from './mode';
import type { Mode, Policy, Rule } from './schema';

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

function matches(rule: Rule, action: PolicyAction, ctx: PolicyContext): boolean {
  const names = Array.isArray(rule.action) ? rule.action : [rule.action];
  if (!names.includes('*') && !names.includes(action.name)) return false;
  const { category, services, signals } = rule.when ?? {};
  if (services && !services.includes(ctx.service)) return false;
  if (category && (ctx.category === undefined || !category.includes(ctx.category))) return false;
  if (signals && !ctx.signals.some((signal) => signals.includes(signal))) return false;
  const bounds = rule.params?.replicas;
  if (bounds) {
    const replicas = action.params?.replicas;
    if (replicas === undefined || replicas < bounds.min || replicas > bounds.max) return false;
  }
  return true;
}

function gate(policy: Policy, action: PolicyAction, ctx: PolicyContext): string | undefined {
  const { limits, llm } = policy;
  const runtime = isRuntimeAction(action);
  const threshold = runtime ? llm.minConfidenceForAction : llm.minConfidenceForPr;
  if (ctx.confidence < threshold) return 'low_confidence';
  const { counters } = ctx;
  const limited = runtime
    ? counters.actionsLast10Min >= limits.maxActionsPerServicePer10Min
    : counters.openPrsLastHour >= limits.maxOpenPrsPerHour;
  if (
    limited ||
    counters.diagnosisLoops >= limits.maxDiagnosisLoops ||
    counters.llmSpentTodayUsd >= limits.llmDailyBudgetUsd
  ) {
    return 'rate_limited';
  }
  return undefined;
}

export function decide(policy: Policy, ctx: PolicyContext, action: PolicyAction): PolicyDecision {
  const { mode, warning } = resolveMode(policy.mode, ctx.envMode);
  const warnings = warning ? [warning] : [];
  const done = (
    effect: Effect,
    reason: string,
    matchedRule: string | null,
    reasons: string[] = [],
  ): PolicyDecision => ({
    effect,
    reason,
    matchedRule,
    mode,
    reasons: [reason, ...reasons],
    warnings,
  });

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
