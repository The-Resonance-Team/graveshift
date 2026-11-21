import type { AgentConfig, ProviderPackage } from '@graveshift/agents';
import {
  generateObject,
  type LanguageModel,
  type LanguageModelUsage,
  NoObjectGeneratedError,
} from 'ai';

import { PROVIDER_FACTORIES, type ProviderFactory } from './providers';
import { GatewayConfigError, type ModelAdapter, type ModelRequest, type Usage } from './types';

export interface AdapterOptions {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

const PLACEHOLDER = /PLACEHOLDER|CHANGEME|YOUR[_-]?API[_-]?KEY|REPLACE[_-]?ME|^<[^>]+>$|^x{3,}$/i;

// The key comes only from the named process environment variable. YAML never holds a key.
export function resolveApiKey(
  agent: Pick<AgentConfig, 'apiKeyEnv'>,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const value = env[agent.apiKeyEnv];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && !PLACEHOLDER.test(trimmed) ? trimmed : undefined;
}

// Most official providers are callable; newer ones expose languageModel(model).
function languageModelFor(provider: unknown, model: string): LanguageModel {
  if (typeof provider === 'function') {
    return (provider as (id: string) => LanguageModel)(model);
  }
  const candidate = provider as Record<string, unknown>;
  const selector = ['languageModel', 'chatModel'].find(
    (key) => typeof candidate[key] === 'function',
  );
  if (selector !== undefined) {
    return (candidate[selector] as (id: string) => LanguageModel)(model);
  }
  throw new GatewayConfigError('provider does not expose a language model');
}

const tokenUsage = (usage: LanguageModelUsage | undefined): Usage => ({
  in: usage?.inputTokens ?? 0,
  out: usage?.outputTokens ?? 0,
});

function adapterFor(
  provider: ProviderPackage,
  model: string,
  resolveModel: () => LanguageModel,
): ModelAdapter {
  return {
    provider,
    model,
    // The key was checked when the adapter was built; availability needs no I/O.
    available: () => true,
    async generateObject(request: ModelRequest) {
      try {
        const result = await generateObject({
          model: resolveModel(),
          schema: request.schema,
          system: request.system,
          prompt: request.prompt,
          temperature: 0,
          maxRetries: 0,
          abortSignal: request.signal,
        });
        return { object: result.object, model, usage: tokenUsage(result.usage) };
      } catch (error) {
        if (!NoObjectGeneratedError.isInstance(error)) throw error;
        // Return billed usage so the gateway can charge for this response before a validation retry.
        return { validationError: error.message, model, usage: tokenUsage(error.usage) };
      }
    },
  };
}

// One thin adapter for every package in PROVIDER_PACKAGES. The official factory owns the HTTP call.
export function createAdapter(agent: AgentConfig, options: AdapterOptions = {}): ModelAdapter {
  const apiKey = resolveApiKey(agent, options.env);
  if (apiKey === undefined) {
    throw new GatewayConfigError(
      `apiKeyEnv ${agent.apiKeyEnv} is unset or holds a placeholder value`,
    );
  }
  const factory = PROVIDER_FACTORIES[agent.provider] as ProviderFactory;
  const instance = factory({
    apiKey,
    baseURL: agent.baseUrl,
    ...(agent.provider === '@ai-sdk/openai-compatible' ? { name: 'openai-compatible' } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  // Model selection is lazy: some factories validate the model id at call time.
  return adapterFor(agent.provider, agent.model, () => languageModelFor(instance, agent.model));
}
