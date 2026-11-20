import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

import {
  AgentConfigSchema,
  AgentsFileSchema,
  declaredParams,
  fillAgentPrompt,
  mergeAgentTemplates,
  PROVIDER_PACKAGES,
  type AgentConfig,
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
};

describe('agent config validation', () => {
  test('accepts a valid config with key-value param maps', () => {
    const parsed = AgentConfigSchema.parse(sreBot);
    expect(parsed.params).toEqual([{ VERSION: 'v1' }, { INCIDENT_DETAIL: 'OOM VPS' }]);
    expect(declaredParams(parsed)).toEqual(['VERSION', 'INCIDENT_DETAIL']);
  });

  test('rejects a malformed params shape', () => {
    expect(() => AgentConfigSchema.parse({ ...sreBot, params: [{ VERSION: 1 }] })).toThrow();
    expect(() =>
      AgentConfigSchema.parse({ ...sreBot, params: [{ 'lower-case': 'v1' }] }),
    ).toThrow();
    expect(() =>
      AgentConfigSchema.parse({ ...sreBot, params: [{ VERSION: 'v1', SERVICE: 'api' }] }),
    ).toThrow();
    expect(() => AgentConfigSchema.parse({ ...sreBot, params: 'VERSION' })).toThrow();
  });

  test('accepts only official provider packages and never a key value', () => {
    expect(PROVIDER_PACKAGES).toContain('@ai-sdk/google');
    expect(() => AgentConfigSchema.parse({ ...sreBot, provider: '@other/google' })).toThrow();
    const withKey = AgentConfigSchema.parse({ ...sreBot, apiKey: 'sk-secret' });
    expect(Object.hasOwn(withKey, 'apiKey')).toBe(false);
    expect(() => AgentConfigSchema.parse({ ...sreBot, apiKeyEnv: 'sk-secret' })).toThrow();
  });
});

describe('agent templates', () => {
  test('client config overrides a system template with the same name', () => {
    const override: AgentConfig = { ...sreBot, model: 'client-model', apiKeyEnv: 'CLIENT_KEY' };
    const merged = mergeAgentTemplates([sreBot, devopsBot], [override]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.model).toBe('client-model');
    expect(merged[0]?.apiKeyEnv).toBe('CLIENT_KEY');
    expect(merged[1]).toEqual(devopsBot);
  });

  test('keeps new client agents and system order', () => {
    const extra: AgentConfig = { ...sreBot, name: 'Extra Bot', role: 'extra' };
    const merged = mergeAgentTemplates([sreBot, devopsBot], [extra]);
    expect(merged.map((agent) => agent.name)).toEqual(['SRE Bot', 'DevOps Bot', 'Extra Bot']);
  });
});

describe('prompt params', () => {
  test('fills every declared placeholder', () => {
    const filled = fillAgentPrompt(sreBot.prompt, {
      VERSION: 'v2',
      INCIDENT_DETAIL: 'OOM VPS',
    });
    expect(filled).toBe('Resolve OOM VPS on version v2.');
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
      expect(agent.apiKeyEnv).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(Object.keys(agent)).not.toContain('apiKey');
    }
  });
});
