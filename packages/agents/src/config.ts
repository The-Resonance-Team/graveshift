import { z } from 'zod';

import { untrustedParam } from './untrusted';

// Official AI SDK provider packages. Checked with ctx7 (/vercel/ai and /websites/ai-sdk_dev).
export const PROVIDER_PACKAGES = [
  '@ai-sdk/anthropic',
  '@ai-sdk/google',
  '@ai-sdk/openai-compatible',
] as const;

export const ProviderPackageSchema = z.enum(PROVIDER_PACKAGES);
export type ProviderPackage = z.infer<typeof ProviderPackageSchema>;

const UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/;
const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;
// A naming guard only. The gateway in ticket #26 enforces the credential allowlist.
const API_KEY_ENV_NAME = /^(?:GRAVESHIFT_[A-Z0-9_]+|[A-Z][A-Z0-9_]*_API_KEY)$/;

const HttpsUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && url.username === '' && url.password === '';
}, 'baseUrl must use https and carry no credentials');

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
  })
  .refine(
    (entries) => {
      const names = entries.flatMap((entry) => Object.keys(entry));
      return new Set(names).size === names.length;
    },
    { message: 'duplicate param name' },
  );

export const AgentConfigSchema = z
  .object({
    name: z.string().min(1),
    role: z.string().min(1),
    description: z.string().min(1),
    prompt: z.string().min(1),
    params: ParamsSchema,
    provider: ProviderPackageSchema,
    model: z.string().min(1),
    baseUrl: HttpsUrlSchema,
    apiKeyEnv: z
      .string()
      .regex(API_KEY_ENV_NAME, 'apiKeyEnv must be GRAVESHIFT_* or end with _API_KEY')
      .describe('Name of the environment variable that holds the key; never a key value'),
    allowedTools: z.array(z.string().min(1)),
    dailyBudgetUsd: z.number().min(0),
    escalateTo: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((agent, ctx) => {
    const names = declaredParams(agent);
    const placeholders = [...agent.prompt.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '');
    const undeclared = placeholders.filter((name) => !names.includes(name));
    const unused = names.filter((name) => !placeholders.includes(name));
    if (undeclared.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['prompt'],
        message: `placeholders without a declared param: ${undeclared.join(', ')}`,
      });
    }
    if (unused.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['prompt'],
        message: `params without a placeholder: ${unused.join(', ')}`,
      });
    }
  });
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const AgentsFileSchema = z
  .object({
    system: z.array(AgentConfigSchema),
    client: z.array(AgentConfigSchema).default([]),
  })
  .strict()
  .superRefine((file, ctx) => {
    for (const list of ['system', 'client'] as const) {
      const seen = new Set<string>();
      file[list].forEach((agent, index) => {
        if (seen.has(agent.name)) {
          ctx.addIssue({
            code: 'custom',
            path: [list, index, 'name'],
            message: `duplicate agent name: ${agent.name}`,
          });
        }
        seen.add(agent.name);
      });
    }
    const names = new Set([...file.system, ...file.client].map((agent) => agent.name));
    for (const list of ['system', 'client'] as const) {
      file[list].forEach((agent, index) => {
        if (agent.escalateTo !== undefined && !names.has(agent.escalateTo)) {
          ctx.addIssue({
            code: 'custom',
            path: [list, index, 'escalateTo'],
            message: `escalateTo must name an existing agent: ${agent.escalateTo}`,
          });
        }
      });
    }
  });
export type AgentsFile = z.infer<typeof AgentsFileSchema>;

// A client config replaces a system template with the same name. It is not a field merge.
export function mergeAgentTemplates(
  systemAgents: readonly AgentConfig[],
  clientAgents: readonly AgentConfig[],
): AgentConfig[] {
  const byName = new Map<string, AgentConfig>();
  for (const agent of systemAgents) byName.set(agent.name, agent);
  for (const agent of clientAgents) byName.set(agent.name, agent);
  return [...byName.values()];
}

// The declared param names are the params of the agent prompt.
export function declaredParams(agent: AgentConfig): string[] {
  return agent.params.flatMap((entry) => Object.keys(entry));
}

// YAML param values are defaults. An empty value means there is no default.
export function paramDefaults(agent: AgentConfig): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const entry of agent.params) {
    for (const [name, value] of Object.entries(entry)) {
      if (value.length > 0) defaults[name] = value;
    }
  }
  return defaults;
}

export function fillAgentPrompt(prompt: string, values: Readonly<Record<string, string>>): string {
  return prompt.replace(PLACEHOLDER, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : untrustedParam(name, value);
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
// On a tie the first agent in the list wins.
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
