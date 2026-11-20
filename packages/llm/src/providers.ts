import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject } from 'ai';

import type { GenerateRequest, LlmProvider } from './types';

export interface OpenAiCompatibleOptions {
  model: string;
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

const isPlaceholder = (model: string) => model.startsWith('<PLACEHOLDER');

// one Vercel AI SDK model; gateway owns retries, so the SDK never retries
export function openAiCompatibleProvider(options: OpenAiCompatibleOptions): LlmProvider {
  const sdk = createOpenAICompatible({
    name: 'openai-compatible',
    baseURL: options.baseUrl,
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return {
    name: 'openai-compatible',
    paid: true,
    available: () => Boolean(options.apiKey) && !isPlaceholder(options.model),
    async generateObject({ system, prompt, schema, signal }: GenerateRequest) {
      const result = await generateObject({
        model: sdk.chatModel(options.model),
        schema,
        system,
        prompt,
        temperature: 0,
        maxRetries: 0,
        abortSignal: signal,
      });
      return {
        object: result.object,
        model: options.model,
        usage: { in: result.usage.inputTokens ?? 0, out: result.usage.outputTokens ?? 0 },
      };
    },
  };
}
