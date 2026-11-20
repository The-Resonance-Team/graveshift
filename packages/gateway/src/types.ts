import { GraveshiftError } from '@graveshift/core';
import type { AgentConfig } from '@graveshift/agents';
import type { z } from 'zod';

export interface Usage {
  in: number;
  out: number;
}

export interface GeneratedObject {
  object: unknown;
  model: string;
  usage: Usage;
}

export interface ModelRequest {
  system: string;
  prompt: string;
  schema: z.ZodType;
  signal: AbortSignal;
}

// One thin adapter wraps one official provider package. The gateway owns retry.
export interface ModelAdapter {
  readonly provider: string;
  readonly model: string;
  available(): boolean | Promise<boolean>;
  generateObject(request: ModelRequest): Promise<GeneratedObject>;
}

export interface AgentBinding {
  agent: AgentConfig;
  adapter: ModelAdapter;
}

export interface GatewayTask<T> {
  agent: string;
  task: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  validate?: (value: T) => string | undefined;
  rulesOnly?: () => T;
}

export type GatewayStatus = 'ok' | 'rules_only' | 'invalid' | 'unavailable';
export type FallbackReason = 'budget' | 'unavailable' | 'invalid';

export interface AuditEvent {
  agent: string;
  task: string;
  status: GatewayStatus;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  model?: string;
  reason?: string;
}

export type GatewayResult<T> =
  | { status: 'ok'; value: T; model: string; usage: Usage; costUsd: number }
  | { status: 'rules_only'; value: T; reason: FallbackReason }
  | { status: 'invalid'; reason: string; usage: Usage; costUsd: number }
  | { status: 'unavailable' };

export class GatewayConfigError extends GraveshiftError<'GATEWAY_CONFIG_ERROR'> {
  constructor(message: string) {
    super('GATEWAY_CONFIG_ERROR', message);
  }
}
