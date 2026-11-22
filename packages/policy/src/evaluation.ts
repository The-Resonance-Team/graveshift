import type { Effect, PolicyAction, PolicyContext, PolicyDecision } from './decide';
import { resolveMode } from './mode';
import type { Policy, Rule } from './schema';

export function matches(rule: Rule, action: PolicyAction, ctx: PolicyContext): boolean {
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

export function gate(policy: Policy, action: PolicyAction, ctx: PolicyContext): string | undefined {
  const { limits, llm } = policy;
  const runtime = action.name !== 'open_pr';
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

export function decisionFor(policy: Policy, ctx: PolicyContext) {
  const { mode, warning } = resolveMode(policy.mode, ctx.envMode);
  return {
    mode,
    done(
      effect: Effect,
      reason: string,
      matchedRule: string | null,
      reasons: string[] = [],
    ): PolicyDecision {
      return {
        effect,
        reason,
        matchedRule,
        mode,
        reasons: [reason, ...reasons],
        warnings: warning ? [warning] : [],
      };
    },
  };
}
