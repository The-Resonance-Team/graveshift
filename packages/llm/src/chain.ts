import { openAiCompatibleProvider } from './providers';
import type { LlmConfig, LlmProvider } from './types';

// the API key comes from the caller's environment, never from the config file
export function buildProviders(
  config: LlmConfig,
  env: Record<string, string | undefined>,
  fetchFn?: typeof fetch,
): LlmProvider[] {
  const apiKey = env.OPENAI_COMPATIBLE_API_KEY;
  return [
    openAiCompatibleProvider({
      model: config.model,
      baseUrl: config.baseUrl,
      ...(apiKey ? { apiKey } : {}),
      ...(fetchFn ? { fetch: fetchFn } : {}),
    }),
  ];
}
