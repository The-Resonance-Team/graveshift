import { z } from 'zod';

import { EventEnvelopeSchema, type EventEnvelope } from './schemas';

// Reuse the envelope field validators so a rule match uses the same wire vocabulary.
const field = EventEnvelopeSchema.shape;

export const RULE_ACTIONS = ['detect', 'suppress', 'escalate'] as const;
export const RuleActionSchema = z.enum(RULE_ACTIONS);
export type RuleAction = z.infer<typeof RuleActionSchema>;

export const RuleMatchSchema = z.object({
  severities: z.array(field.severity).optional(),
  services: z.array(field.service).optional(),
  types: z.array(field.type).optional(),
  tenantId: field.tenantId.optional(),
});
export type RuleMatch = z.infer<typeof RuleMatchSchema>;

export const RuleSchema = z.object({
  id: field.id,
  enabled: z.boolean(),
  priority: z.number().int().min(0),
  match: RuleMatchSchema,
  action: RuleActionSchema,
});
export type Rule = z.infer<typeof RuleSchema>;

export const DEFAULT_RULE_ACTION: RuleAction = 'detect';

export interface OverrideDetection {
  ids: string[];
  warning: string;
}

const order = (a: Rule, b: Rule): number =>
  a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const matches = (rule: Rule, envelope: EventEnvelope): boolean => {
  const match = rule.match;
  return (
    (match.severities === undefined || match.severities.includes(envelope.severity)) &&
    (match.services === undefined || match.services.includes(envelope.service)) &&
    (match.types === undefined || match.types.includes(envelope.type)) &&
    (match.tenantId === undefined || match.tenantId === envelope.tenantId)
  );
};

// A pure engine: it sorts a copy, calls no model and causes no side effects.
export function evaluateEnvelope(envelope: EventEnvelope, rules: readonly Rule[]): RuleAction {
  for (const rule of [...rules].sort(order)) {
    if (rule.enabled && matches(rule, envelope)) return rule.action;
  }
  return DEFAULT_RULE_ACTION;
}

export function mergeRules(systemRules: readonly Rule[], clientRules: readonly Rule[]): Rule[] {
  const overrides = new Map(clientRules.map((rule) => [rule.id, rule]));
  const systemIds = new Set(systemRules.map((rule) => rule.id));
  return [
    ...systemRules.map((rule) => overrides.get(rule.id) ?? rule),
    ...clientRules.filter((rule) => !systemIds.has(rule.id)),
  ];
}

export function detectRuleOverrides(
  systemRules: readonly Rule[],
  clientRules: readonly Rule[],
): OverrideDetection {
  const systemIds = new Set(systemRules.map((rule) => rule.id));
  const ids = [
    ...new Set(clientRules.map((rule) => rule.id).filter((id) => systemIds.has(id))),
  ].sort();
  if (ids.length === 0) return { ids, warning: '' };
  return {
    ids,
    warning: `Warning: client rules override system rules with these ids: ${ids.join(', ')}. Confirm the rule overrides before save.`,
  };
}
