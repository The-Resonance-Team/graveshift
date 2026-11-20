import { describe, expect, test } from 'bun:test';
import { type AgentConfig, AgentConfigSchema } from '@graveshift/agents';
import { z } from 'zod';

import { createAdapter, resolveApiKey } from './adapters';
import type { GatewayConfig } from './config';
import { createGateway } from './gateway';
import { type AuditEvent, GatewayConfigError } from './types';
import fixture from '../fixtures/openai-compatible.json';

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

const key = 'fake-key-998877';
const env = { GRAVESHIFT_TEST_KEY: key };
const compatible = () =>
  agent({
    provider: '@ai-sdk/openai-compatible',
    model: 'qwen3.8-flash-next',
    baseUrl: 'https://models.test/v1',
  });
const Out = z.object({ category: z.string(), confidence: z.number() });

interface Seen {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  hasSignal: boolean;
}

function replay(body: unknown, seen: Seen[] = [], status = 200): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({
      url: input.toString(),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      hasSignal: init?.signal instanceof AbortSignal,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const request = {
  system: 'sys',
  prompt: 'prompt',
  schema: Out,
  signal: AbortSignal.timeout(5000),
};

const config: GatewayConfig = {
  globalDailyBudgetUsd: 100,
  maxRetries: 0,
  timeoutMs: 1000,
  priceTableUsdPer1M: { 'qwen3.8-flash-next': { in: 1, out: 2 } },
};

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
      expect((error as Error).message).not.toContain(key);
    }
  });
});

describe('real generateObject wrapper with a fake fetch (no network)', () => {
  test('uses the baseURL, passes abortSignal, sets maxRetries to zero and maps usage', async () => {
    const seen: Seen[] = [];
    const adapter = createAdapter(compatible(), { env, fetch: replay(fixture, seen) });
    const result = await adapter.generateObject(request);
    expect(result.object).toEqual({ category: 'code_bug', confidence: 0.8 });
    expect(result.model).toBe('qwen3.8-flash-next');
    expect(result.usage).toEqual({ in: 120, out: 30 });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe('https://models.test/v1/chat/completions');
    expect(seen[0]?.hasSignal).toBe(true);
    expect(seen[0]?.body).toMatchObject({ model: 'qwen3.8-flash-next', temperature: 0 });
  });

  test('the SDK does not retry inside the adapter', async () => {
    const seen: Seen[] = [];
    const adapter = createAdapter(compatible(), {
      env,
      fetch: replay({ error: { message: 'boom' } }, seen, 500),
    });
    await expect(adapter.generateObject(request)).rejects.toBeDefined();
    expect(seen).toHaveLength(1);
  });

  test('the key comes only from apiKeyEnv and appears only in the Authorization header', async () => {
    const seen: Seen[] = [];
    const adapter = createAdapter(compatible(), { env, fetch: replay(fixture, seen) });
    await adapter.generateObject(request);
    expect(seen[0]?.headers.authorization).toBe(`Bearer ${key}`);
    expect(seen[0]?.url).not.toContain(key);
    expect(JSON.stringify(seen[0]?.body)).not.toContain(key);
    expect(() =>
      createAdapter(compatible(), {
        env: { SOME_OTHER_KEY: key },
        fetch: replay(fixture, seen),
      }),
    ).toThrow(GatewayConfigError);
    expect(resolveApiKey(compatible(), { SOME_OTHER_KEY: key })).toBeUndefined();
  });

  test('SDK errors do not expose the key in the thrown message or the audit event', async () => {
    const failed = createAdapter(compatible(), {
      env,
      fetch: replay({ error: { message: 'boom' } }, [], 500),
    });
    let thrown: unknown;
    try {
      await failed.generateObject(request);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(thrown instanceof Error ? thrown.message : String(thrown)).not.toContain(key);

    const events: AuditEvent[] = [];
    const adapter = createAdapter(compatible(), {
      env,
      fetch: replay({ error: { message: 'boom' } }, [], 500),
    });
    const gw = createGateway({
      agents: [{ agent: compatible(), adapter }],
      config,
      onAudit: (event) => events.push(event),
    });
    const result = await gw.run({
      agent: 'SRE Bot',
      task: 'diagnose',
      system: 'sys',
      prompt: 'prompt',
      schema: Out,
      rulesOnly: () => ({ category: 'unknown', confidence: 0.1 }),
    });
    expect(result.status).toBe('rules_only');
    expect(JSON.stringify(events)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain(key);
  });
});
