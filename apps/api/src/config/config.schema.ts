import {
  AgentConfigSchema,
  type AgentsFile,
  type AgentConfig,
  declaredParams,
  ParamNameSchema,
} from '@graveshift/agents';
import { PolicySchema, type Policy, RuleSchema } from '@graveshift/policy';
import { z } from 'zod';

// Sanitized dashboard view for config:read. The whitelist below is the whole output:
// prompt, baseUrl, apiKeyEnv and allowedTools never leave the full config, params carry
// their names only, and no environment value is ever resolved. Every field schema comes
// from the source schema, so a check is not copied and a drift fails closed at parse.
const DashboardAgentSchema = z.object({
  name: AgentConfigSchema.shape.name,
  slug: AgentConfigSchema.shape.slug,
  role: AgentConfigSchema.shape.role,
  description: AgentConfigSchema.shape.description,
  provider: AgentConfigSchema.shape.provider,
  model: AgentConfigSchema.shape.model,
  dailyBudgetUsd: AgentConfigSchema.shape.dailyBudgetUsd,
  escalateTo: AgentConfigSchema.shape.escalateTo,
  // Declared param names only. A param value stays in the full config.
  params: z.array(ParamNameSchema),
});

export const ConfigAgentsViewSchema = z
  .object({
    system: z.array(DashboardAgentSchema),
    client: z.array(DashboardAgentSchema),
  })
  .strict();
export type ConfigAgentsView = z.infer<typeof ConfigAgentsViewSchema>;

// A rule is published as identity and decision only. when.services, when.signals,
// when.category and params.replicas stay in the full config.
const DashboardRuleSchema = z.object({
  id: RuleSchema.shape.id,
  action: RuleSchema.shape.action,
  effect: RuleSchema.shape.effect,
});

// Sanitized policy view for config:read. approvers and the whole github block are
// dropped, so no approver id, repo name, branch name or allowed/forbidden path is
// exposed. limits, llm and the default carry no secret.
export const ConfigPolicyViewSchema = z.object({
  version: PolicySchema.shape.version,
  mode: PolicySchema.shape.mode,
  limits: PolicySchema.shape.limits,
  llm: PolicySchema.shape.llm,
  rules: z.array(DashboardRuleSchema),
  default: PolicySchema.shape.default,
});
export type ConfigPolicyView = z.infer<typeof ConfigPolicyViewSchema>;

function toDashboardAgent(agent: AgentConfig) {
  return {
    name: agent.name,
    slug: agent.slug,
    role: agent.role,
    description: agent.description,
    provider: agent.provider,
    model: agent.model,
    dailyBudgetUsd: agent.dailyBudgetUsd,
    ...(agent.escalateTo === undefined ? {} : { escalateTo: agent.escalateTo }),
    params: declaredParams(agent),
  };
}

export function toConfigAgentsView(agents: AgentsFile): ConfigAgentsView {
  return ConfigAgentsViewSchema.parse({
    system: agents.system.map(toDashboardAgent),
    client: agents.client.map(toDashboardAgent),
  });
}

export function toConfigPolicyView(policy: Policy): ConfigPolicyView {
  return ConfigPolicyViewSchema.parse({
    version: policy.version,
    mode: policy.mode,
    limits: policy.limits,
    llm: policy.llm,
    rules: policy.rules.map((rule) => ({ id: rule.id, action: rule.action, effect: rule.effect })),
    default: policy.default,
  });
}
