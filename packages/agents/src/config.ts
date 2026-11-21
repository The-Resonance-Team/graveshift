import { z } from 'zod';

import { untrustedParam } from './untrusted';

// All first-party AI SDK connector packages. Source: official provider docs
// (ai-sdk.dev/providers/ai-sdk-providers) and vercel/ai packages, checked with
// ctx7 (/vercel/ai). Core, UI, tooling and integration packages are excluded.
export const PROVIDER_PACKAGES = [
  '@ai-sdk/alibaba',
  '@ai-sdk/amazon-bedrock',
  '@ai-sdk/anthropic',
  '@ai-sdk/anthropic-aws',
  '@ai-sdk/assemblyai',
  '@ai-sdk/azure',
  '@ai-sdk/baseten',
  '@ai-sdk/black-forest-labs',
  '@ai-sdk/bytedance',
  '@ai-sdk/cartesia',
  '@ai-sdk/cerebras',
  '@ai-sdk/cohere',
  '@ai-sdk/deepgram',
  '@ai-sdk/deepinfra',
  '@ai-sdk/deepseek',
  '@ai-sdk/elevenlabs',
  '@ai-sdk/fal',
  '@ai-sdk/fish-audio',
  '@ai-sdk/fireworks',
  '@ai-sdk/gateway',
  '@ai-sdk/gladia',
  '@ai-sdk/gmicloud',
  '@ai-sdk/google',
  '@ai-sdk/google-vertex',
  '@ai-sdk/groq',
  '@ai-sdk/heygen',
  '@ai-sdk/huggingface',
  '@ai-sdk/hume',
  '@ai-sdk/klingai',
  '@ai-sdk/liquid',
  '@ai-sdk/luma',
  '@ai-sdk/minimax',
  '@ai-sdk/mistral',
  '@ai-sdk/moonshotai',
  '@ai-sdk/open-responses',
  '@ai-sdk/openai',
  '@ai-sdk/openai-compatible',
  '@ai-sdk/parallel',
  '@ai-sdk/perplexity',
  '@ai-sdk/prodia',
  '@ai-sdk/quiverai',
  '@ai-sdk/replicate',
  '@ai-sdk/revai',
  '@ai-sdk/scaledown',
  '@ai-sdk/tencent',
  '@ai-sdk/togetherai',
  '@ai-sdk/topaz',
  '@ai-sdk/typesafe-ai',
  '@ai-sdk/voyage',
  '@ai-sdk/xai',
  '@ai-sdk/zai',
] as const;

export const ProviderPackageSchema = z.enum(PROVIDER_PACKAGES);
export type ProviderPackage = z.infer<typeof ProviderPackageSchema>;

const UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/;
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
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
    // Stable machine reference; escalateTo points here, not at the display name.
    slug: z.string().regex(SLUG, 'slug must use lower-case letters, digits and hyphens'),
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
    escalateTo: z.string().regex(SLUG, 'escalateTo must be an agent slug').optional(),
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
      const names = new Set<string>();
      const slugs = new Set<string>();
      file[list].forEach((agent, index) => {
        if (names.has(agent.name)) {
          ctx.addIssue({
            code: 'custom',
            path: [list, index, 'name'],
            message: `duplicate agent name: ${agent.name}`,
          });
        }
        if (slugs.has(agent.slug)) {
          ctx.addIssue({
            code: 'custom',
            path: [list, index, 'slug'],
            message: `duplicate agent slug: ${agent.slug}`,
          });
        }
        names.add(agent.name);
        slugs.add(agent.slug);
      });
    }
    const slugs = new Set([...file.system, ...file.client].map((agent) => agent.slug));
    for (const list of ['system', 'client'] as const) {
      file[list].forEach((agent, index) => {
        if (agent.escalateTo !== undefined && !slugs.has(agent.escalateTo)) {
          ctx.addIssue({
            code: 'custom',
            path: [list, index, 'escalateTo'],
            message: `escalateTo must reference an existing agent slug: ${agent.escalateTo}`,
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
