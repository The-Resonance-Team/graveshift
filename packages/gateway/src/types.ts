import { GraveshiftError } from '@graveshift/core';
import type { AgentConfig } from '@graveshift/agents';
import type { z } from 'zod';

export interface Usage {
  in: number;
  out: number;
}

export type GeneratedObject = {
  model: string;
  usage: Partial<Usage>;
} & ({ object: unknown } | { validationError: string });

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
  readonly capability: 'structured_language' | 'unsupported';
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
  validate: (value: T) => string | undefined;
  rulesOnly?: () => T;
  signal?: AbortSignal;
}

export type GatewayStatus = 'ok' | 'rules_only' | 'invalid' | 'unavailable';
export type FallbackReason = 'budget' | 'unavailable' | 'invalid';
export type UnavailableReason =
  | 'unavailable'
  | 'budget'
  | 'unsupported_task'
  | 'cancelled'
  | 'pricing_unavailable'
  | 'validation_unavailable'
  | 'configuration_unavailable'
  | 'fallback_unavailable'
  | 'audit_unavailable';

export interface CallTotals {
  callId: string;
  usage: Usage;
  costUsd: number | null;
}

export interface AuditAck {
  callId: string;
}

export type AuditSink = (event: AuditEvent) => Promise<AuditAck>;

export interface AuditEvent {
  callId: string;
  agent: string;
  task: string;
  status: GatewayStatus;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  model?: string;
  reason?: string;
}

export type GatewayResult<T> = CallTotals &
  (
    | { status: 'ok'; value: T; model: string }
    | { status: 'rules_only'; value: T; reason: FallbackReason }
    | { status: 'invalid'; reason: string }
    | { status: 'unavailable'; reason: UnavailableReason }
  );

export class GatewayConfigError extends GraveshiftError<'GATEWAY_CONFIG_ERROR'> {
  constructor(message: string) {
    super('GATEWAY_CONFIG_ERROR', message);
  }
}

export class UnsupportedTaskError extends GraveshiftError<'UNSUPPORTED_MODEL_TASK'> {
  constructor() {
    super('UNSUPPORTED_MODEL_TASK', 'provider does not support structured language tasks');
  }
}

export class AuditAcknowledgementError extends GraveshiftError<'AUDIT_ACK_MISMATCH'> {
  constructor() {
    super('AUDIT_ACK_MISMATCH', 'audit acknowledgement does not match the model call');
  }
}
