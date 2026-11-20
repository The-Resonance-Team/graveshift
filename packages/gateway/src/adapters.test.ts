import { describe, expect, test } from 'bun:test';
import { type AgentConfig, AgentConfigSchema } from '@graveshift/agents';

import { createAdapter, resolveApiKey } from './adapters';
import { GatewayConfigError } from './types';

const agent = (over: Partial<AgentConfig> = {}): AgentConfig =>
  AgentConfigSchema.parse({
    name: 'SRE Bot',
    role: 'sre',
    description: 'Handles incidents.',
    prompt: 'Resolve {{INCIDENT_DETAIL}}.',
    params: [{ INCIDENT_DETAIL: '' }],
    provider: '@ai-sdk/google',
    model: 'test-model',
    baseUrl: 'https://models.test/v1',
    apiKeyEnv: 'GRAVESHIFT_TEST_KEY',
    allowedTools: [],
    dailyBudgetUsd: 100,
    ...over,
  });

const env = { GRAVESHIFT_TEST_KEY: 'fake-key-123' };

describe('official provider adapters', () => {
  test('builds one thin adapter for each supported package, with no model call', async () => {
    const providers = ['@ai-sdk/google', '@ai-sdk/anthropic', '@ai-sdk/openai-compatible'] as const;
    const adapters = providers.map((provider) => ({
      provider,
      adapter: createAdapter(agent({ provider }), { env }),
    }));
    for (const { provider, adapter } of adapters) {
      expect(adapter.provider).toBe(provider);
      expect(adapter.model).toBe('test-model');
    }
    expect(await Promise.all(adapters.map(({ adapter }) => adapter.available()))).toEqual([
      true,
      true,
      true,
    ]);
  });

  test('reads the key from the env name in the agent config only', () => {
    expect(resolveApiKey(agent(), env)).toBe('fake-key-123');
    expect(resolveApiKey(agent({ apiKeyEnv: 'ANTHROPIC_API_KEY' }), env)).toBeUndefined();
    expect(
      resolveApiKey(agent({ apiKeyEnv: 'ANTHROPIC_API_KEY' }), {
        ANTHROPIC_API_KEY: 'other-fake-key',
      }),
    ).toBe('other-fake-key');
  });

  test('rejects an unset, empty or placeholder key', () => {
    for (const value of [undefined, '', '   ', '<PLACEHOLDER_API_KEY>', 'CHANGEME', 'xxxxxxxx']) {
      const candidate = value === undefined ? {} : { GRAVESHIFT_TEST_KEY: value };
      expect(() => createAdapter(agent(), { env: candidate })).toThrow(GatewayConfigError);
      expect(resolveApiKey(agent(), candidate)).toBeUndefined();
    }
    try {
      createAdapter(agent(), { env: {} });
    } catch (error) {
      expect((error as Error).message).toContain('GRAVESHIFT_TEST_KEY');
      expect((error as Error).message).not.toContain('fake-key-123');
    }
  });
});
