import { describe, expect, test } from 'bun:test';
import {
  type AgentConfig,
  AgentConfigSchema,
  PROVIDER_PACKAGES,
  type ProviderPackage,
} from '@graveshift/agents';
import { z } from 'zod';

import { createAdapter, resolveApiKey } from './adapters';
import type { GatewayConfig } from './config';
import { PROVIDER_FACTORIES } from './providers';
import { createGateway } from './gateway';
import { acknowledgedAudit } from './testing';
import { type AuditEvent, GatewayConfigError, UnsupportedTaskError } from './types';
import fixture from '../fixtures/openai-compatible.json';

const agent = (over: Partial<AgentConfig> = {}): AgentConfig =>
  AgentConfigSchema.parse({
    name: 'SRE Bot',
    slug: 'sre-bot',
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
  test('keeps every official provider in the catalog and inspects its model without network access', async () => {
    expect(Object.keys(PROVIDER_FACTORIES).sort()).toEqual([...PROVIDER_PACKAGES].sort());
    const adapters = PROVIDER_PACKAGES.map((provider) => ({
      provider,
      adapter: createAdapter(agent({ provider }), { env }),
    }));
    for (const { provider, adapter } of adapters) {
      expect(adapter.provider).toBe(provider);
      expect(adapter.model).toBe('test-model');
    }
    const available = await Promise.all(adapters.map(({ adapter }) => adapter.available()));
    expect(available.some(Boolean)).toBe(true);
    expect(available.every(Boolean)).toBe(false);
  });

  test.each<ProviderPackage>([
    '@ai-sdk/replicate',
    '@ai-sdk/assemblyai',
    '@ai-sdk/cartesia',
    '@ai-sdk/elevenlabs',
    '@ai-sdk/parallel',
    '@ai-sdk/voyage',
  ])('%s cannot run a structured language task or spend on transport retries', async (provider) => {
    const selected = agent({ provider });
    const seen: Seen[] = [];
    const adapter = createAdapter(selected, { env, fetch: replay(fixture, seen) });
    expect(adapter.capability).toBe('unsupported');
    expect(await adapter.available()).toBe(false);
    const events: AuditEvent[] = [];
    const gateway = createGateway({
      agents: [{ agent: selected, adapter }],
      config: { ...config, maxRetries: 3, priceTableUsdPer1M: { 'test-model': { in: 1, out: 2 } } },
      onAudit: acknowledgedAudit(events),
    });
    expect(
      await gateway.run({
        agent: selected.name,
        task: 'diagnose',
        system: 'sys',
        prompt: 'prompt',
        schema: Out,
        validate: () => undefined,
      }),
    ).toMatchObject({
      status: 'unavailable',
      reason: 'unsupported_task',
      usage: { in: 0, out: 0 },
    });
    await expect(adapter.generateObject(request)).rejects.toBeInstanceOf(UnsupportedTaskError);
    expect(seen).toHaveLength(0);
    expect(events).toHaveLength(1);
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
    expect(result).toEqual({
      object: { category: 'code_bug', confidence: 0.8 },
      model: 'qwen3.8-flash-next',
      usage: { in: 120, out: 30 },
    });
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

  test('an invalid billed response retains SDK usage for gateway accounting', async () => {
    const invalid = {
      ...fixture,
      choices: [{ index: 0, message: { content: '{bad JSON' }, finish_reason: 'stop' }],
    };
    const seen: Seen[] = [];
    const adapter = createAdapter(compatible(), { env, fetch: replay(invalid, seen) });
    expect(await adapter.generateObject(request)).toMatchObject({
      validationError: expect.any(String),
      usage: { in: 120, out: 30 },
      model: compatible().model,
    });
    expect(seen).toHaveLength(1);
  });

  test('absent SDK usage stays unknown instead of becoming a zero-cost response', async () => {
    const adapter = createAdapter(compatible(), {
      env,
      fetch: replay({ ...fixture, usage: null }),
    });
    const result = await adapter.generateObject(request);
    expect(result.usage).toEqual({});
  });

  test('the compatible SDK zero default cannot turn missing completion usage into a known cost', async () => {
    const adapter = createAdapter(compatible(), {
      env,
      fetch: replay({ ...fixture, usage: { prompt_tokens: 120 } }),
    });
    const result = await adapter.generateObject(request);
    expect(result.usage).toEqual({ in: 120 });
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
      onAudit: acknowledgedAudit(events),
    });
    const result = await gw.run({
      agent: 'SRE Bot',
      task: 'diagnose',
      system: 'sys',
      prompt: 'prompt',
      schema: Out,
      validate: () => undefined,
      rulesOnly: () => ({ category: 'unknown', confidence: 0.1 }),
    });
    expect(result.status).toBe('rules_only');
    expect(JSON.stringify(events)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain(key);
  });
});
