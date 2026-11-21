import { createAlibaba } from '@ai-sdk/alibaba';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAnthropicAws } from '@ai-sdk/anthropic-aws';
import { createAssemblyAI } from '@ai-sdk/assemblyai';
import { createAzure } from '@ai-sdk/azure';
import { createBaseten } from '@ai-sdk/baseten';
import { createBlackForestLabs } from '@ai-sdk/black-forest-labs';
import { createByteDance } from '@ai-sdk/bytedance';
import { createCartesia } from '@ai-sdk/cartesia';
import { createCerebras } from '@ai-sdk/cerebras';
import { createCohere } from '@ai-sdk/cohere';
import { createDeepgram } from '@ai-sdk/deepgram';
import { createDeepInfra } from '@ai-sdk/deepinfra';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createElevenLabs } from '@ai-sdk/elevenlabs';
import { createFal } from '@ai-sdk/fal';
import { createFireworks } from '@ai-sdk/fireworks';
import { createFishAudio } from '@ai-sdk/fish-audio';
import { createGateway } from '@ai-sdk/gateway';
import { createGladia } from '@ai-sdk/gladia';
import { createGmicloud } from '@ai-sdk/gmicloud';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGoogleVertex } from '@ai-sdk/google-vertex';
import { createGroq } from '@ai-sdk/groq';
import { createHeyGen } from '@ai-sdk/heygen';
import { createHuggingFace } from '@ai-sdk/huggingface';
import { createHume } from '@ai-sdk/hume';
import { createKlingAI } from '@ai-sdk/klingai';
import { createLiquid } from '@ai-sdk/liquid';
import { createLuma } from '@ai-sdk/luma';
import { createMiniMax } from '@ai-sdk/minimax';
import { createMistral } from '@ai-sdk/mistral';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createOpenResponses } from '@ai-sdk/open-responses';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createParallel } from '@ai-sdk/parallel';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createProdia } from '@ai-sdk/prodia';
import { createQuiverAI } from '@ai-sdk/quiverai';
import { createReplicate } from '@ai-sdk/replicate';
import { createRevai } from '@ai-sdk/revai';
import { createScaleDown } from '@ai-sdk/scaledown';
import { createTencent } from '@ai-sdk/tencent';
import { createTogetherAI } from '@ai-sdk/togetherai';
import { createTopaz } from '@ai-sdk/topaz';
import { createTypeSafeAi } from '@ai-sdk/typesafe-ai';
import { createVoyage } from '@ai-sdk/voyage';
import { createXai } from '@ai-sdk/xai';
import { createZai } from '@ai-sdk/zai';

import type { ProviderPackage } from '@graveshift/agents';

export interface ProviderFactoryOptions {
  apiKey: string;
  baseURL: string;
  fetch?: typeof fetch;
}

export type ProviderFactory = (options: ProviderFactoryOptions) => unknown;

// One entry for every package in PROVIDER_PACKAGES. The official factory owns the HTTP call.
export const PROVIDER_FACTORIES = {
  '@ai-sdk/alibaba': createAlibaba,
  '@ai-sdk/amazon-bedrock': createAmazonBedrock,
  '@ai-sdk/anthropic': createAnthropic,
  '@ai-sdk/anthropic-aws': createAnthropicAws,
  '@ai-sdk/assemblyai': createAssemblyAI,
  '@ai-sdk/azure': createAzure,
  '@ai-sdk/baseten': createBaseten,
  '@ai-sdk/black-forest-labs': createBlackForestLabs,
  '@ai-sdk/bytedance': createByteDance,
  '@ai-sdk/cartesia': createCartesia,
  '@ai-sdk/cerebras': createCerebras,
  '@ai-sdk/cohere': createCohere,
  '@ai-sdk/deepgram': createDeepgram,
  '@ai-sdk/deepinfra': createDeepInfra,
  '@ai-sdk/deepseek': createDeepSeek,
  '@ai-sdk/elevenlabs': createElevenLabs,
  '@ai-sdk/fal': createFal,
  '@ai-sdk/fireworks': createFireworks,
  '@ai-sdk/fish-audio': createFishAudio,
  '@ai-sdk/gateway': createGateway,
  '@ai-sdk/gladia': createGladia,
  '@ai-sdk/gmicloud': createGmicloud,
  '@ai-sdk/google': createGoogleGenerativeAI,
  '@ai-sdk/google-vertex': createGoogleVertex,
  '@ai-sdk/groq': createGroq,
  '@ai-sdk/heygen': createHeyGen,
  '@ai-sdk/huggingface': createHuggingFace,
  '@ai-sdk/hume': createHume,
  '@ai-sdk/klingai': createKlingAI,
  '@ai-sdk/liquid': createLiquid,
  '@ai-sdk/luma': createLuma,
  '@ai-sdk/minimax': createMiniMax,
  '@ai-sdk/mistral': createMistral,
  '@ai-sdk/moonshotai': createMoonshotAI,
  '@ai-sdk/open-responses': createOpenResponses,
  '@ai-sdk/openai': createOpenAI,
  '@ai-sdk/openai-compatible': createOpenAICompatible,
  '@ai-sdk/parallel': createParallel,
  '@ai-sdk/perplexity': createPerplexity,
  '@ai-sdk/prodia': createProdia,
  '@ai-sdk/quiverai': createQuiverAI,
  '@ai-sdk/replicate': createReplicate,
  '@ai-sdk/revai': createRevai,
  '@ai-sdk/scaledown': createScaleDown,
  '@ai-sdk/tencent': createTencent,
  '@ai-sdk/togetherai': createTogetherAI,
  '@ai-sdk/topaz': createTopaz,
  '@ai-sdk/typesafe-ai': createTypeSafeAi,
  '@ai-sdk/voyage': createVoyage,
  '@ai-sdk/xai': createXai,
  '@ai-sdk/zai': createZai,
} satisfies Record<ProviderPackage, unknown>;
