import { z } from 'zod';

import {
  type GenerateRequest,
  type LlmProvider,
  LlmProviderError,
  type Tier,
  type Usage,
} from './types';

type Models = Record<Tier, string>;
const isPlaceholder = (model: string) => model.startsWith('<PLACEHOLDER');

// models may answer with fenced or chatty JSON; anything unparsable goes to schema validation as text
export function extractObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  try {
    return JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch {
    return text;
  }
}

async function postJson(
  fetchFn: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new LlmProviderError(`provider responded ${res.status}`);
  return res.json();
}

const usage = (input = 0, output = 0): Usage => ({ in: input, out: output });

export interface HttpProviderOptions {
  models: Models;
  fetch?: typeof fetch;
}

// ponytail: bearer API-key auth only, upgrade to SigV4 signing if IAM roles are required
export function bedrockProvider(
  options: HttpProviderOptions & { region: string; apiKey?: string },
): LlmProvider {
  const Response = z.object({
    output: z.object({ message: z.object({ content: z.array(z.object({ text: z.string() })) }) }),
    usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  });
  return {
    name: 'bedrock',
    paid: true,
    available: () => Boolean(options.apiKey) && !isPlaceholder(options.models.smart),
    async generateObject({ tier, system, prompt, signal }: GenerateRequest) {
      const model = options.models[tier];
      const url = `https://bedrock-runtime.${options.region}.amazonaws.com/model/${encodeURIComponent(model)}/converse`;
      const raw = await postJson(
        options.fetch ?? fetch,
        url,
        { authorization: `Bearer ${options.apiKey}` },
        {
          system: [{ text: system }],
          messages: [{ role: 'user', content: [{ text: prompt }] }],
          inferenceConfig: { temperature: 0 },
        },
        signal,
      );
      const parsed = Response.parse(raw);
      const text = parsed.output.message.content.map((c) => c.text).join('');
      return {
        object: extractObject(text),
        model,
        usage: usage(parsed.usage.inputTokens, parsed.usage.outputTokens),
      };
    },
  };
}

export function geminiProvider(options: HttpProviderOptions & { apiKey?: string }): LlmProvider {
  const Response = z.object({
    candidates: z
      .array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string() })) }) }))
      .min(1),
    usageMetadata: z
      .object({ promptTokenCount: z.number(), candidatesTokenCount: z.number() })
      .optional(),
  });
  return {
    name: 'gemini',
    paid: true,
    available: () => Boolean(options.apiKey) && !isPlaceholder(options.models.smart),
    async generateObject({ tier, system, prompt, signal }: GenerateRequest) {
      const model = options.models[tier];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const raw = await postJson(
        options.fetch ?? fetch,
        url,
        { 'x-goog-api-key': options.apiKey ?? '' },
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        },
        signal,
      );
      const parsed = Response.parse(raw);
      const text = parsed.candidates[0]?.content.parts.map((p) => p.text).join('') ?? '';
      const meta = parsed.usageMetadata;
      return {
        object: extractObject(text),
        model,
        usage: usage(meta?.promptTokenCount, meta?.candidatesTokenCount),
      };
    },
  };
}

export function ollamaProvider(options: HttpProviderOptions & { baseUrl: string }): LlmProvider {
  const Response = z.object({
    message: z.object({ content: z.string() }),
    prompt_eval_count: z.number().optional(),
    eval_count: z.number().optional(),
  });
  return {
    name: 'ollama',
    paid: false,
    available: () => !isPlaceholder(options.models.smart),
    async generateObject({ tier, system, prompt, signal }: GenerateRequest) {
      const model = options.models[tier];
      const raw = await postJson(
        options.fetch ?? fetch,
        new URL('/api/chat', options.baseUrl).toString(),
        {},
        {
          model,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        },
        signal,
      );
      const parsed = Response.parse(raw);
      return {
        object: extractObject(parsed.message.content),
        model,
        usage: usage(parsed.prompt_eval_count, parsed.eval_count),
      };
    },
  };
}
