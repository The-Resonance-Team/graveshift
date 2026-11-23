import { UNTRUSTED_SYSTEM_NOTE, wrapUntrusted } from '@graveshift/agents/untrusted';
import { redact } from '@graveshift/redactor';

import { createAccounting } from './accounting';
import { acknowledge, type Decision } from './completion';
import { GatewayConfigSchema, type GatewayConfig } from './config';
import {
  GatewayConfigError,
  UnsupportedTaskError,
  type AgentBinding,
  type AuditSink,
  type FallbackReason,
  type GeneratedObject,
  type GatewayResult,
  type GatewayTask,
  type UnavailableReason,
} from './types';

export interface GatewayOptions {
  agents: readonly AgentBinding[];
  config: GatewayConfig;
  onAudit: AuditSink;
  now?: () => Date;
}

type Attempt<T> =
  | { kind: 'ok'; value: T; model: string }
  | { kind: 'invalid'; reason: string }
  | { kind: 'unavailable'; reason: UnavailableReason };

export function createGateway(options: GatewayOptions) {
  // The message covers both descriptions: "audit sink is required" and
  // "durable audit sink is required" (ADR 0022).
  if (typeof options.onAudit !== 'function')
    throw new GatewayConfigError('a durable audit sink is required');
  const config = GatewayConfigSchema.parse(options.config);
  const accounting = createAccounting(options.agents, config, options.now);

  async function run<T>(task: GatewayTask<T>): Promise<GatewayResult<T>> {
    if (typeof task.validate !== 'function')
      throw new GatewayConfigError('a task validator is required');

    const account = accounting.open(task.agent);
    const binding = accounting.binding(task.agent);
    const unavailable = (reason: UnavailableReason): Decision<T> => ({
      result: { status: 'unavailable', reason, ...account.totals() },
      reason,
    });
    const fallback = (reason: FallbackReason, detail: string): Decision<T> => {
      if (task.rulesOnly === undefined)
        return { ...unavailable(reason === 'invalid' ? 'unavailable' : reason), reason: detail };
      try {
        return {
          result: { status: 'rules_only', value: task.rulesOnly(), reason, ...account.totals() },
          reason: detail,
        };
      } catch {
        return {
          ...unavailable('fallback_unavailable'),
          reason: `${detail}; rules-only fallback failed`,
        };
      }
    };
    const invalid = (reason: string): Decision<T> =>
      task.rulesOnly === undefined
        ? { result: { status: 'invalid', reason: redact(reason), ...account.totals() }, reason }
        : fallback('invalid', reason);

    async function decide(): Promise<Decision<T>> {
      if (task.signal?.aborted) return unavailable('cancelled');
      if (binding === undefined) return fallback('unavailable', 'no adapter for agent');
      if (binding.adapter.capability !== 'structured_language')
        return unavailable('unsupported_task');
      let available: boolean;
      try {
        available = await binding.adapter.available();
      } catch {
        available = false;
      }
      if (!available) return fallback('unavailable', 'provider unavailable');
      if (account.exhausted()) return fallback('budget', 'budget exhausted');
      const adapter = binding.adapter;
      const system = `${redact(task.system)}\n${UNTRUSTED_SYSTEM_NOTE}`;
      const prompt = redact(task.prompt);

      async function call(
        text: string,
        remaining: number,
      ): Promise<{ response: GeneratedObject } | { reason: UnavailableReason }> {
        if (task.signal?.aborted) return { reason: 'cancelled' };
        const timeout = AbortSignal.timeout(config.timeoutMs);
        const signal =
          task.signal === undefined ? timeout : AbortSignal.any([timeout, task.signal]);
        try {
          return {
            response: await adapter.generateObject({
              system,
              prompt: text,
              schema: task.schema,
              signal,
            }),
          };
        } catch (error) {
          if (error instanceof UnsupportedTaskError) return { reason: 'unsupported_task' };
          if (error instanceof GatewayConfigError) return { reason: 'configuration_unavailable' };
          if (task.signal?.aborted) return { reason: 'cancelled' };
          return remaining > 0 && !signal.aborted
            ? call(text, remaining - 1)
            : { reason: 'unavailable' };
        }
      }

      async function generate(text: string): Promise<Attempt<T>> {
        const called = await call(text, config.maxRetries);
        if ('reason' in called) return { kind: 'unavailable', reason: called.reason };
        const { response } = called;
        if (!account.record(response))
          return { kind: 'unavailable', reason: 'pricing_unavailable' };
        if (task.signal?.aborted) return { kind: 'unavailable', reason: 'cancelled' };
        if ('validationError' in response)
          return { kind: 'invalid', reason: response.validationError };
        try {
          const parsed = task.schema.safeParse(response.object);
          if (!parsed.success) return { kind: 'invalid', reason: parsed.error.message };
          const problem = task.validate(parsed.data);
          return problem === undefined
            ? { kind: 'ok', value: parsed.data, model: response.model }
            : { kind: 'invalid', reason: problem };
        } catch {
          return { kind: 'unavailable', reason: 'validation_unavailable' };
        }
      }

      let final = await generate(prompt);
      if (final.kind === 'invalid') {
        if (account.exhausted())
          return fallback('budget', 'budget exhausted before validation retry');
        final = await generate(
          `${prompt}\n\n${wrapUntrusted('validation_error', redact(final.reason))}\nReturn corrected JSON only.`,
        );
      }
      if (final.kind === 'ok') {
        return {
          result: {
            status: 'ok',
            value: final.value,
            model: final.model,
            ...account.totals(),
          },
        };
      }
      if (final.kind === 'invalid') return invalid(final.reason);
      return final.reason === 'unavailable'
        ? fallback('unavailable', 'transport failure')
        : unavailable(final.reason);
    }

    const decision = await decide();
    return acknowledge(options.onAudit, task, decision, account.model());
  }

  return { run, budgetSnapshot: () => accounting.snapshot() };
}

export type Gateway = ReturnType<typeof createGateway>;
