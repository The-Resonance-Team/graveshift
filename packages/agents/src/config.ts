import { z } from 'zod';

// Official AI SDK provider packages. Checked with ctx7 (/vercel/ai and /websites/ai-sdk_dev).
export const PROVIDER_PACKAGES = [
  '@ai-sdk/anthropic',
  '@ai-sdk/google',
  '@ai-sdk/openai-compatible',
] as const;

export const ProviderPackageSchema = z.enum(PROVIDER_PACKAGES);
export type ProviderPackage = z.infer<typeof ProviderPackageSchema>;

const UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/;

// A param is one key-value map, for example { INCIDENT_DETAIL: "OOM VPS" }.
export const ParamEntrySchema = z.record(
  z.string().regex(UPPER_SNAKE, 'param name must be UPPER_SNAKE_CASE'),
  z.string(),
);
export type ParamEntry = z.infer<typeof ParamEntrySchema>;

export const ParamsSchema = z
  .array(ParamEntrySchema)
  .refine((entries) => entries.every((entry) => Object.keys(entry).length === 1), {
    message: 'each param entry must hold exactly one key',
  });

export const AgentConfigSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  description: z.string().min(1),
  prompt: z.string().min(1),
  params: ParamsSchema,
  provider: ProviderPackageSchema,
  model: z.string().min(1),
  baseUrl: z.url(),
  apiKeyEnv: z.string().regex(UPPER_SNAKE, 'apiKeyEnv must be an environment variable name'),
  allowedTools: z.array(z.string().min(1)),
  dailyBudgetUsd: z.number().min(0),
  escalateTo: z.string().min(1).optional(),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const AgentsFileSchema = z.object({
  system: z.array(AgentConfigSchema),
  client: z.array(AgentConfigSchema).default([]),
});
export type AgentsFile = z.infer<typeof AgentsFileSchema>;

// Client config overrides a system template with the same agent name.
export function mergeAgentTemplates(
  systemAgents: readonly AgentConfig[],
  clientAgents: readonly AgentConfig[],
): AgentConfig[] {
  const byName = new Map<string, AgentConfig>();
  for (const agent of systemAgents) byName.set(agent.name, agent);
  for (const agent of clientAgents) byName.set(agent.name, agent);
  return [...byName.values()];
}

// The declared param names are the required params of the agent prompt.
export function declaredParams(agent: AgentConfig): string[] {
  return agent.params.flatMap((entry) => Object.keys(entry));
}

export function fillAgentPrompt(prompt: string, values: Readonly<Record<string, string>>): string {
  return prompt.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : value;
  });
}

const STOP_WORDS = new Set([
  'and',
  'are',
  'bot',
  'can',
  'for',
  'from',
  'handles',
  'how',
  'into',
  'its',
  'that',
  'the',
  'this',
  'what',
  'when',
  'with',
  'you',
  'your',
]);

export function triggerKeywords(description: string): string[] {
  const words = description.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  return [...new Set(words.filter((word) => !STOP_WORDS.has(word)))];
}

// Returns the agent with the most trigger keywords in the request text.
export function selectAgentByKeywords(
  agents: readonly AgentConfig[],
  requestText: string,
): AgentConfig | undefined {
  const tokens = new Set(requestText.toLowerCase().match(/[a-z][a-z0-9-]*/g) ?? []);
  let best: AgentConfig | undefined;
  let bestScore = 0;
  for (const agent of agents) {
    const score = triggerKeywords(agent.description).filter((word) => tokens.has(word)).length;
    if (score > bestScore) {
      best = agent;
      bestScore = score;
    }
  }
  return best;
}
