import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AgentConfig, ProviderPackage } from '@graveshift/agents';
import { type LanguageModel, generateObject } from 'ai';

import { GatewayConfigError, type ModelAdapter, type ModelRequest } from './types';

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

function adapterFor(
  provider: ProviderPackage,
  model: string,
  languageModel: LanguageModel,
): ModelAdapter {
  return {
    provider,
    model,
    // The key was checked when the adapter was built; availability needs no I/O.
    available: () => true,
    async generateObject(request: ModelRequest) {
      const result = await generateObject({
        model: languageModel,
        schema: request.schema,
        system: request.system,
        prompt: request.prompt,
        temperature: 0,
        maxRetries: 0,
        abortSignal: request.signal,
      });
      return {
        object: result.object,
        model,
        usage: { in: result.usage.inputTokens ?? 0, out: result.usage.outputTokens ?? 0 },
      };
    },
  };
}

// One thin adapter per official package. No hand-written HTTP adapter and no vendor chain.
export function createAdapter(agent: AgentConfig, options: AdapterOptions = {}): ModelAdapter {
  const apiKey = resolveApiKey(agent, options.env);
  if (apiKey === undefined) {
    throw new GatewayConfigError(
      `apiKeyEnv ${agent.apiKeyEnv} is unset or holds a placeholder value`,
    );
  }
  const customFetch = options.fetch ? { fetch: options.fetch } : {};
  switch (agent.provider) {
    case '@ai-sdk/google': {
      const google = createGoogleGenerativeAI({
        apiKey,
        baseURL: agent.baseUrl,
        ...customFetch,
      });
      return adapterFor(agent.provider, agent.model, google(agent.model));
    }
    case '@ai-sdk/anthropic': {
      const anthropic = createAnthropic({
        apiKey,
        baseURL: agent.baseUrl,
        ...customFetch,
      });
      return adapterFor(agent.provider, agent.model, anthropic(agent.model));
    }
    case '@ai-sdk/openai-compatible': {
      const compatible = createOpenAICompatible({
        name: 'openai-compatible',
        apiKey,
        baseURL: agent.baseUrl,
        ...customFetch,
      });
      return adapterFor(agent.provider, agent.model, compatible.chatModel(agent.model));
    }
  }
}
