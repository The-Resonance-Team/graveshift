import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { z } from 'zod';

import bedrock from '../fixtures/bedrock.json';
import gemini from '../fixtures/gemini.json';
import ollama from '../fixtures/ollama.json';
import { bedrockProvider, extractObject, geminiProvider, ollamaProvider } from './providers';
import type { LlmProvider } from './types';

const Output = z.object({ category: z.string(), confidence: z.number() });
const models = { fast: 'fast-model', smart: 'smart-model' };

interface Seen {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function replay(fixture: unknown, seen: Seen[] = [], status = 200): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    seen.push({
      url: input.toString(),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify(fixture), { status });
  }) as unknown as typeof fetch;
}

const request = {
  tier: 'smart' as const,
  system: 'sys',
  prompt: 'prompt',
  signal: AbortSignal.timeout(1000),
};

async function conforms(provider: LlmProvider) {
  const result = await provider.generateObject(request);
  expect(Output.parse(result.object)).toEqual({ category: 'code_bug', confidence: 0.8 });
  expect(result.model).toBe('smart-model');
  expect(result.usage.in).toBeGreaterThan(0);
}

describe('adapter schema conformance (recorded fixtures, no network)', () => {
  test('bedrock converse', async () => {
    const seen: Seen[] = [];
    await conforms(
      bedrockProvider({
        models,
        region: 'ap-southeast-1',
        apiKey: 'test-key',
        fetch: replay(bedrock, seen),
      }),
    );
    expect(seen[0]?.url).toBe(
      'https://bedrock-runtime.ap-southeast-1.amazonaws.com/model/smart-model/converse',
    );
    expect(seen[0]?.headers.authorization).toBe('Bearer test-key');
  });

  test('gemini generateContent', async () => {
    const seen: Seen[] = [];
    await conforms(geminiProvider({ models, apiKey: 'test-key', fetch: replay(gemini, seen) }));
    expect(seen[0]?.url).toContain('/models/smart-model:generateContent');
    expect(seen[0]?.headers['x-goog-api-key']).toBe('test-key');
  });

  test('ollama chat', async () => {
    const seen: Seen[] = [];
    await conforms(
      ollamaProvider({ models, baseUrl: 'http://ollama:11434', fetch: replay(ollama, seen) }),
    );
    expect(seen[0]?.url).toBe('http://ollama:11434/api/chat');
    expect(seen[0]?.body).toMatchObject({ stream: false, format: 'json', model: 'smart-model' });
  });

  test('provider errors surface as LlmProviderError', async () => {
    const provider = ollamaProvider({
      models,
      baseUrl: 'http://ollama:11434',
      fetch: replay({}, [], 500),
    });
    await expect(provider.generateObject(request)).rejects.toMatchObject({
      code: 'LLM_PROVIDER_ERROR',
    });
  });
});

describe('availability', () => {
  test('paid providers need a key and a non-placeholder model', async () => {
    const placeholder = { fast: '<PLACEHOLDER_MODEL_ID>', smart: '<PLACEHOLDER_MODEL_ID>' };
    expect(await bedrockProvider({ models, region: 'r' }).available()).toBe(false);
    expect(
      await bedrockProvider({ models: placeholder, region: 'r', apiKey: 'k' }).available(),
    ).toBe(false);
    expect(await geminiProvider({ models, apiKey: 'k' }).available()).toBe(true);
    expect(await ollamaProvider({ models: placeholder, baseUrl: 'http://o' }).available()).toBe(
      false,
    );
  });
});

describe('extractObject', () => {
  test('property: recovers any JSON object from fenced or chatty text', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ minLength: 1 }), fc.integer()), (object) => {
        const json = JSON.stringify(object);
        expect(extractObject(json)).toEqual(object);
        expect(extractObject(`Sure!\n\`\`\`json\n${json}\n\`\`\`\nDone.`)).toEqual(object);
      }),
    );
  });

  test('unparsable text is passed through for schema validation to reject', () => {
    expect(extractObject('no json here')).toBe('no json here');
  });
});
