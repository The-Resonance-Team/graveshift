import type { AgentConfig, ProviderPackage } from '@graveshift/agents';
import {
  generateObject,
  type LanguageModel,
  type LanguageModelUsage,
  NoObjectGeneratedError,
  NoSuchModelError,
  UnsupportedFunctionalityError,
} from 'ai';

import { PROVIDER_FACTORIES, type ProviderFactory } from './providers';
import {
  GatewayConfigError,
  UnsupportedTaskError,
  type ModelAdapter,
  type ModelRequest,
  type Usage,
} from './types';

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

type SdkLanguageModel = Exclude<LanguageModel, string>;

function isLanguageModel(value: unknown): value is SdkLanguageModel {
  return (
    typeof value === 'object' &&
    value !== null &&
    'specificationVersion' in value &&
    ['v2', 'v3', 'v4'].includes(String(value.specificationVersion)) &&
    'modelId' in value &&
    typeof value.modelId === 'string' &&
    'provider' in value &&
    typeof value.provider === 'string' &&
    'supportedUrls' in value &&
    'doGenerate' in value &&
    typeof value.doGenerate === 'function' &&
    'doStream' in value &&
    typeof value.doStream === 'function'
  );
}

// A callable provider can produce images or speech. Select and inspect its language model instead.
function languageModelFor(provider: unknown, id: string): SdkLanguageModel | undefined {
  if ((typeof provider !== 'object' || provider === null) && typeof provider !== 'function')
    return undefined;
  if (!('languageModel' in provider) || typeof provider.languageModel !== 'function')
    return undefined;
  try {
    const model: unknown = provider.languageModel(id);
    return isLanguageModel(model) ? model : undefined;
  } catch {
    return undefined;
  }
}

function tokenUsage(
  usage: LanguageModelUsage | undefined,
  provider: ProviderPackage,
): Partial<Usage> {
  const raw = usage?.raw;
  // The compatible SDK converter defaults omitted fields to zero; raw presence preserves uncertainty.
  const compatible = provider === '@ai-sdk/openai-compatible' && raw !== undefined;
  const input =
    compatible && typeof raw.prompt_tokens !== 'number' ? undefined : usage?.inputTokens;
  const output =
    compatible && typeof raw.completion_tokens !== 'number' ? undefined : usage?.outputTokens;
  return {
    ...(input === undefined ? {} : { in: input }),
    ...(output === undefined ? {} : { out: output }),
  };
}

function adapterFor(
  provider: ProviderPackage,
  model: string,
  languageModel: SdkLanguageModel | undefined,
): ModelAdapter {
  return {
    provider,
    model,
    capability: languageModel === undefined ? 'unsupported' : 'structured_language',
    // The key was checked when the adapter was built; availability needs no I/O.
    available: () => languageModel !== undefined,
    async generateObject(request: ModelRequest) {
      if (languageModel === undefined) throw new UnsupportedTaskError();
      try {
        const result = await generateObject({
          model: languageModel,
          schema: request.schema,
          system: request.system,
          prompt: request.prompt,
          temperature: 0,
          maxRetries: 0,
          abortSignal: request.signal,
        });
        return { object: result.object, model, usage: tokenUsage(result.usage, provider) };
      } catch (error) {
        if (NoSuchModelError.isInstance(error) || UnsupportedFunctionalityError.isInstance(error)) {
          throw new UnsupportedTaskError();
        }
        if (!NoObjectGeneratedError.isInstance(error)) throw error;
        // Return billed usage so the gateway can charge for this response before a validation retry.
        return { validationError: error.message, model, usage: tokenUsage(error.usage, provider) };
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
  const factory: ProviderFactory = PROVIDER_FACTORIES[agent.provider];
  const instance = factory({
    apiKey,
    baseURL: agent.baseUrl,
    name: 'openai-compatible',
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return adapterFor(agent.provider, agent.model, languageModelFor(instance, agent.model));
}
