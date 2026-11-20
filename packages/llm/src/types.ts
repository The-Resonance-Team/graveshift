import { GraveshiftError } from '@graveshift/core';
import { z } from 'zod';

export const PROVIDER_NAMES = ['bedrock', 'gemini', 'ollama'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];
export type Tier = 'fast' | 'smart';

const models = z.object({ fast: z.string().min(1), smart: z.string().min(1) });

export const LlmConfigSchema = z.object({
  chain: z.array(z.enum(PROVIDER_NAMES)).min(1),
  bedrock: z.object({ region: z.string().min(1), models }).optional(),
  gemini: z.object({ models }).optional(),
  ollama: z.object({ baseUrl: z.string().min(1), models }).optional(),
  timeoutMs: z.number().int().positive(),
  maxRetries: z.number().int().min(0),
  priceTableUsdPer1M: z.record(
    z.string(),
    z.object({ in: z.number().min(0), out: z.number().min(0) }),
  ),
});
export type LlmConfig = z.infer<typeof LlmConfigSchema>;

export interface Usage {
  in: number;
  out: number;
}

export interface GenerateRequest {
  tier: Tier;
  system: string;
  prompt: string;
  signal: AbortSignal;
}

export interface LlmProvider {
  name: ProviderName;
  paid: boolean;
  available(): boolean | Promise<boolean>;
  generateObject(req: GenerateRequest): Promise<{ object: unknown; model: string; usage: Usage }>;
}

export class LlmProviderError extends GraveshiftError<'LLM_PROVIDER_ERROR'> {
  constructor(message: string) {
    super('LLM_PROVIDER_ERROR', message);
  }
}

export interface LlmTask<T> {
  name: string;
  tier: Tier;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  validate?: (value: T) => string | undefined;
  rulesOnly?: () => T;
}

export interface Skipped {
  provider: string;
  reason: 'unavailable' | 'budget' | 'failed';
}

export type LlmResult<T> =
  | {
      status: 'ok';
      value: T;
      provider: ProviderName;
      model: string;
      usage: Usage;
      costUsd: number;
      skipped: Skipped[];
    }
  | { status: 'rules_only'; value: T; skipped: Skipped[] }
  | { status: 'invalid'; reason: string; provider: ProviderName; skipped: Skipped[] }
  | { status: 'unavailable'; skipped: Skipped[] };

export interface AuditEvent {
  task: string;
  status: LlmResult<unknown>['status'];
  provider?: ProviderName;
  model?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  skipped: Skipped[];
}
