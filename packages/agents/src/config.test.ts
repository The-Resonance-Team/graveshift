import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

import {
  AgentConfigSchema,
  AgentsFileSchema,
  declaredParams,
  fillAgentPrompt,
  mergeAgentTemplates,
  paramDefaults,
  PROVIDER_PACKAGES,
  type AgentConfig,
  type ProviderPackage,
} from './config';

const sreBot: AgentConfig = {
  name: 'SRE Bot',
  role: 'sre',
  description: 'Handles incidents, outages and OOM VPS restarts.',
  prompt: 'Resolve {{INCIDENT_DETAIL}} on version {{VERSION}}.',
  params: [{ VERSION: 'v1' }, { INCIDENT_DETAIL: 'OOM VPS' }],
  provider: '@ai-sdk/google',
  model: 'gemini-3.8-flash-high',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
  allowedTools: ['query_metric', 'tail_logs'],
  dailyBudgetUsd: 2.5,
  escalateTo: 'DevOps Bot',
};

const devopsBot: AgentConfig = {
  name: 'DevOps Bot',
  role: 'devops',
  description: 'Handles deployment, pipeline and infrastructure tasks.',
  prompt: 'Check deployment {{VERSION}} for {{SERVICE}}.',
  params: [{ VERSION: 'v1' }, { SERVICE: 'api' }],
  provider: '@ai-sdk/anthropic',
  model: 'claude-sonnet-5.5',
  baseUrl: 'https://api.anthropic.com/v1',
  apiKeyEnv: 'ANTHROPIC_API_KEY',
  allowedTools: ['propose_fix'],
  dailyBudgetUsd: 5,
  escalateTo: 'SRE Bot',
};

describe('agent config validation', () => {
  test('accepts a valid config with key-value param maps', () => {
    const parsed = AgentConfigSchema.parse(sreBot);
    expect(parsed.params).toEqual([{ VERSION: 'v1' }, { INCIDENT_DETAIL: 'OOM VPS' }]);
    expect(declaredParams(parsed)).toEqual(['VERSION', 'INCIDENT_DETAIL']);
    expect(paramDefaults(parsed)).toEqual({ VERSION: 'v1', INCIDENT_DETAIL: 'OOM VPS' });
  });

  test('rejects a malformed or duplicate params shape', () => {
    expect(() => AgentConfigSchema.parse({ ...sreBot, params: [{ VERSION: 1 }] })).toThrow();
    expect(() =>
      AgentConfigSchema.parse({ ...sreBot, params: [{ 'lower-case': 'v1' }] }),
    ).toThrow();
    expect(() =>
      AgentConfigSchema.parse({ ...sreBot, params: [{ VERSION: 'v1', SERVICE: 'api' }] }),
    ).toThrow();
    expect(() => AgentConfigSchema.parse({ ...sreBot, params: 'VERSION' })).toThrow();
    expect(() =>
      AgentConfigSchema.parse({ ...sreBot, params: [{ VERSION: 'v1' }, { VERSION: 'v2' }] }),
    ).toThrow();
  });

  test('rejects an apiKey instead of dropping it silently', () => {
    expect(() => AgentConfigSchema.parse({ ...sreBot, apiKey: 'sk-secret' })).toThrow();
    expect(() =>
      AgentsFileSchema.parse({ system: [{ ...sreBot, apiKey: 'sk-secret' }] }),
    ).toThrow();
    expect(() => AgentsFileSchema.parse({ system: [sreBot], unknown: true })).toThrow();
  });

  test('accepts every official AI SDK connector package', () => {
    expect(PROVIDER_PACKAGES.length).toBe(51);
    const samples: ProviderPackage[] = [
      '@ai-sdk/openai',
      '@ai-sdk/amazon-bedrock',
      '@ai-sdk/gateway',
      '@ai-sdk/xai',
      '@ai-sdk/zai',
      '@ai-sdk/openai-compatible',
    ];
    for (const provider of samples) {
      expect(PROVIDER_PACKAGES).toContain(provider);
      expect(AgentConfigSchema.parse({ ...sreBot, provider }).provider).toBe(provider);
    }
    expect(() => AgentConfigSchema.parse({ ...sreBot, provider: '@other/google' })).toThrow();
    expect(() => AgentConfigSchema.parse({ ...sreBot, provider: '@ai-sdk/react' })).toThrow();
    expect(() => AgentConfigSchema.parse({ ...sreBot, provider: '@ai-sdk/provider' })).toThrow();
  });

  test('requires https baseUrl without credentials', () => {
    expect(AgentConfigSchema.parse(sreBot).baseUrl).toBe(sreBot.baseUrl);
    expect(() =>
      AgentConfigSchema.parse({ ...sreBot, baseUrl: 'http://example.com/v1' }),
    ).toThrow();
    expect(() =>
      AgentConfigSchema.parse({ ...sreBot, baseUrl: 'https://user:pass@example.com/v1' }),
    ).toThrow();
  });

  test('restricts apiKeyEnv to a safe naming pattern', () => {
    expect(
      AgentConfigSchema.parse({ ...sreBot, apiKeyEnv: 'GRAVESHIFT_CLIENT_API_KEY' }),
    ).toBeDefined();
    expect(() => AgentConfigSchema.parse({ ...sreBot, apiKeyEnv: 'CLIENT_KEY' })).toThrow();
    expect(() =>
      AgentConfigSchema.parse({ ...sreBot, apiKeyEnv: 'AWS_SECRET_ACCESS_KEY' }),
    ).toThrow();
    expect(() => AgentConfigSchema.parse({ ...sreBot, apiKeyEnv: 'sk-secret' })).toThrow();
  });

  test('requires prompt and params to declare each other', () => {
    expect(() => AgentConfigSchema.parse({ ...sreBot, prompt: 'Resolve {{UNKNOWN}}.' })).toThrow();
    expect(() => AgentConfigSchema.parse({ ...sreBot, prompt: 'Resolve the incident.' })).toThrow();
    expect(AgentConfigSchema.parse(sreBot)).toBeDefined();
  });
});

describe('agent lists', () => {
  test('client config overrides a system template with the same name', () => {
    const override: AgentConfig = {
      ...sreBot,
      model: 'client-model',
      apiKeyEnv: 'GRAVESHIFT_CLIENT_API_KEY',
    };
    const merged = mergeAgentTemplates([sreBot, devopsBot], [override]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.model).toBe('client-model');
    expect(merged[0]?.apiKeyEnv).toBe('GRAVESHIFT_CLIENT_API_KEY');
    expect(merged[1]).toEqual(devopsBot);
  });

  test('keeps new client agents and system order', () => {
    const extra: AgentConfig = { ...sreBot, name: 'Extra Bot', role: 'extra' };
    const merged = mergeAgentTemplates([sreBot, devopsBot], [extra]);
    expect(merged.map((agent) => agent.name)).toEqual(['SRE Bot', 'DevOps Bot', 'Extra Bot']);
  });

  test('rejects duplicate names in system and in client', () => {
    expect(() => AgentsFileSchema.parse({ system: [sreBot, sreBot] })).toThrow();
    expect(() => AgentsFileSchema.parse({ system: [], client: [devopsBot, devopsBot] })).toThrow();
  });

  test('requires escalateTo to name an existing agent', () => {
    expect(() =>
      AgentsFileSchema.parse({ system: [{ ...sreBot, escalateTo: 'Missing Bot' }] }),
    ).toThrow();
    expect(AgentsFileSchema.parse({ system: [sreBot, devopsBot] }).system).toHaveLength(2);
  });
});

describe('prompt params', () => {
  test('wraps every filled value as untrusted data', () => {
    const filled = fillAgentPrompt(sreBot.prompt, {
      VERSION: 'v2',
      INCIDENT_DETAIL: 'OOM VPS',
    });
    expect(filled).toContain('<untrusted_param name="VERSION">v2</untrusted_param>');
    expect(filled).toContain('<untrusted_param name="INCIDENT_DETAIL">OOM VPS</untrusted_param>');
    expect(filled).not.toContain('{{');
  });
});

describe('example config file', () => {
  test('reads no secret value from YAML', async () => {
    const path = fileURLToPath(new URL('../../../agents.example.yaml', import.meta.url));
    const raw: unknown = Bun.YAML.parse(await Bun.file(path).text());
    const file = AgentsFileSchema.parse(raw);
    const agents = mergeAgentTemplates(file.system, file.client);

    expect(agents.map((agent) => agent.name)).toEqual(['SRE Bot', 'DevOps Bot']);
    expect(agents[0]?.provider).toBe('@ai-sdk/google');
    expect(agents[1]?.provider).toBe('@ai-sdk/anthropic');
    expect(JSON.stringify(raw)).not.toContain('sk-');
    expect(JSON.stringify(file)).not.toContain('"apiKey"');
    for (const agent of agents) {
      expect(agent.apiKeyEnv).toMatch(/_API_KEY$/);
      expect(Object.keys(agent)).not.toContain('apiKey');
    }
  });
});
