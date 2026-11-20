import { describe, expect, test } from 'bun:test';

import fixture from '../fixtures/openai-compatible.json';
import { buildProviders } from './chain';
import { LlmConfigSchema } from './types';

const config = LlmConfigSchema.parse({
  provider: 'openai-compatible',
  model: 'qwen3.8-flash-next',
  baseUrl: 'http://models.test:8888/v1',
  timeoutMs: 1000,
  maxRetries: 0,
  priceTableUsdPer1M: { 'qwen3.8-flash-next': { in: 1, out: 2 } },
});

interface Seen {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function replay(body: unknown, seen: Seen[] = [], status = 200): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({
      url: input.toString(),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const request = {
  tier: 'smart' as const,
  system: 'sys',
  prompt: 'prompt',
  signal: AbortSignal.timeout(5000),
};
const env = { OPENAI_COMPATIBLE_API_KEY: 'test-key' };

describe('config', () => {
  test('accepts the single-provider shape', () => {
    expect(config.provider).toBe('openai-compatible');
  });

  test('rejects the removed chain shape, unknown providers and bad URLs', () => {
    expect(LlmConfigSchema.safeParse({ ...config, provider: 'gemini' }).success).toBe(false);
    expect(LlmConfigSchema.safeParse({ ...config, baseUrl: 'not a url' }).success).toBe(false);
    expect(LlmConfigSchema.safeParse({ ...config, model: '' }).success).toBe(false);
    expect(
      LlmConfigSchema.safeParse({ timeoutMs: 1, maxRetries: 0, priceTableUsdPer1M: {} }),
    ).toHaveProperty('success', false);
  });
});

describe('openai-compatible provider (recorded fixture, no network)', () => {
  test('builds exactly one provider', () => {
    expect(buildProviders(config, env)).toHaveLength(1);
  });

  test('calls chat completions with bearer key and maps object, model and usage', async () => {
    const seen: Seen[] = [];
    const [provider] = buildProviders(config, env, replay(fixture, seen));
    const { z } = await import('zod');
    const result = await provider!.generateObject({
      ...request,
      schema: z.object({ category: z.string(), confidence: z.number() }),
    });
    expect(result.object).toEqual({ category: 'code_bug', confidence: 0.8 });
    expect(result.model).toBe('qwen3.8-flash-next');
    expect(result.usage).toEqual({ in: 120, out: 30 });
    expect(seen[0]?.url).toBe('http://models.test:8888/v1/chat/completions');
    expect(seen[0]?.headers.authorization).toBe('Bearer test-key');
    expect(seen[0]?.body).toMatchObject({ model: 'qwen3.8-flash-next', temperature: 0 });
  });

  test('HTTP errors surface as exceptions the gateway can retry', async () => {
    const [provider] = buildProviders(config, env, replay({ error: { message: 'boom' } }, [], 500));
    const { z } = await import('zod');
    await expect(
      provider!.generateObject({ ...request, schema: z.object({}) }),
    ).rejects.toBeDefined();
  });

  test('is paid, and unavailable without a key or with a placeholder model', async () => {
    const [ready] = buildProviders(config, env);
    expect(ready?.paid).toBe(true);
    expect(await ready?.available()).toBe(true);
    expect(await buildProviders(config, {})[0]?.available()).toBe(false);
    expect(await buildProviders(config, { OPENAI_COMPATIBLE_API_KEY: '' })[0]?.available()).toBe(
      false,
    );
    const placeholder = { ...config, model: '<PLACEHOLDER_MODEL>' };
    expect(await buildProviders(placeholder, env)[0]?.available()).toBe(false);
  });
});
