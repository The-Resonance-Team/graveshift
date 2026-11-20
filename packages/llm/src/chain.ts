import { bedrockProvider, geminiProvider, ollamaProvider } from './providers';
import type { LlmConfig, LlmProvider } from './types';

// credentials come from the caller's environment, never from the config file
export function buildProviders(
  config: LlmConfig,
  env: Record<string, string | undefined>,
  fetchFn: typeof fetch = fetch,
): LlmProvider[] {
  const providers: LlmProvider[] = [];
  for (const name of config.chain) {
    if (name === 'bedrock' && config.bedrock) {
      providers.push(
        bedrockProvider({
          ...config.bedrock,
          fetch: fetchFn,
          ...(env.AWS_BEARER_TOKEN_BEDROCK ? { apiKey: env.AWS_BEARER_TOKEN_BEDROCK } : {}),
        }),
      );
    }
    if (name === 'gemini' && config.gemini) {
      providers.push(
        geminiProvider({
          ...config.gemini,
          fetch: fetchFn,
          ...(env.GEMINI_API_KEY ? { apiKey: env.GEMINI_API_KEY } : {}),
        }),
      );
    }
    if (name === 'ollama' && config.ollama)
      providers.push(ollamaProvider({ ...config.ollama, fetch: fetchFn }));
  }
  return providers;
}
