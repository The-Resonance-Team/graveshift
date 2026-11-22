import { AgentConfigSchema, type AgentsFile } from '@graveshift/agents';
import { PolicySchema, type Policy } from '@graveshift/policy';
import { z } from 'zod';

// Sanitized dashboard view for config:read. The whitelist below is the whole output:
// prompt, params, baseUrl, apiKeyEnv and allowedTools never leave the full config, and
// no environment value is ever resolved. The field schemas come from the source
// schemas, so a check is not copied and a drift fails closed at parse.
const DashboardAgentSchema = z.object({
  name: AgentConfigSchema.shape.name,
  slug: AgentConfigSchema.shape.slug,
  role: AgentConfigSchema.shape.role,
  description: AgentConfigSchema.shape.description,
  provider: AgentConfigSchema.shape.provider,
  model: AgentConfigSchema.shape.model,
  dailyBudgetUsd: AgentConfigSchema.shape.dailyBudgetUsd,
  escalateTo: AgentConfigSchema.shape.escalateTo,
});

export const ConfigAgentsViewSchema = z
  .object({
    system: z.array(DashboardAgentSchema),
    client: z.array(DashboardAgentSchema),
  })
  .strict();
export type ConfigAgentsView = z.infer<typeof ConfigAgentsViewSchema>;

// Sanitized policy view for config:read. approvers and the whole github block are
// dropped, so no approver id, repo name, branch name or allowed/forbidden path is
// exposed. limits, llm, rules and the default carry no secret.
export const ConfigPolicyViewSchema = z.object({
  version: PolicySchema.shape.version,
  mode: PolicySchema.shape.mode,
  limits: PolicySchema.shape.limits,
  llm: PolicySchema.shape.llm,
  rules: PolicySchema.shape.rules,
  default: PolicySchema.shape.default,
});
export type ConfigPolicyView = z.infer<typeof ConfigPolicyViewSchema>;

export function toConfigAgentsView(agents: AgentsFile): ConfigAgentsView {
  return ConfigAgentsViewSchema.parse(agents);
}

export function toConfigPolicyView(policy: Policy): ConfigPolicyView {
  return ConfigPolicyViewSchema.parse(policy);
}
