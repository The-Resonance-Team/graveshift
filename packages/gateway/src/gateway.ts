import { redact } from '@graveshift/redactor';

import { createDailyBudget, type DailyBudget } from './budget';
import { GatewayConfigSchema, type GatewayConfig } from './config';
import {
  type AgentBinding,
  type AuditEvent,
  type FallbackReason,
  type GeneratedObject,
  type GatewayResult,
  type GatewayTask,
  type Usage,
  GatewayConfigError,
} from './types';

export interface GatewayOptions {
  agents: readonly AgentBinding[];
  config: GatewayConfig;
  onAudit: (event: AuditEvent) => unknown;
  now?: () => Date;
}

type Attempt<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'invalid'; reason: string }
  | { kind: 'failed' }
  | { kind: 'unpriced' };

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : 'unknown failure';

export function createGateway(options: GatewayOptions) {
  if (typeof options.onAudit !== 'function')
    throw new GatewayConfigError('an audit sink is required');
  const config = GatewayConfigSchema.parse(options.config);
  const names = new Set<string>();
  for (const { agent } of options.agents) {
    if (names.has(agent.name)) {
      throw new GatewayConfigError(`duplicate agent name: ${agent.name}`);
    }
    names.add(agent.name);
  }
  const globalBudget = createDailyBudget(
    config.globalDailyBudgetUsd,
    config.priceTableUsdPer1M,
    options.now,
  );
  const perAgent = new Map<string, DailyBudget>();
  for (const { agent } of options.agents) {
    perAgent.set(
      agent.name,
      createDailyBudget(agent.dailyBudgetUsd, config.priceTableUsdPer1M, options.now),
    );
  }

  // The result is only redacted, schema-validated data. No tool runs and no permission is granted.
  async function run<T>(task: GatewayTask<T>): Promise<GatewayResult<T>> {
    if (typeof task.validate !== 'function')
      throw new GatewayConfigError('a task validator is required');
    const system = redact(task.system);
    const prompt = redact(task.prompt);
    const binding: AgentBinding | undefined = options.agents.find(
      (entry) => entry.agent.name === task.agent,
    );
    const budget = perAgent.get(task.agent);
    // ponytail: check and charge are not atomic; concurrent calls can overshoot the budget, reserve tokens when calls run in parallel
    const total: Usage = { in: 0, out: 0 };
    let cost = 0;
    let model = '';

    const totals = () => ({ usage: { ...total }, costUsd: cost });

    const finish = async (result: GatewayResult<T>, reason?: string): Promise<GatewayResult<T>> => {
      await options.onAudit({
        agent: task.agent,
        task: task.task,
        status: result.status,
        tokensIn: total.in,
        tokensOut: total.out,
        costUsd: cost,
        ...(model.length === 0 ? {} : { model }),
        ...(reason === undefined ? {} : { reason: redact(reason) }),
      });
      return result;
    };

    // A failing fallback still ends in a typed result and one audit event.
    const fallback = (reason: FallbackReason, auditReason: string): Promise<GatewayResult<T>> => {
      if (task.rulesOnly === undefined) return finish({ status: 'unavailable' }, auditReason);
      let value: T;
      try {
        value = task.rulesOnly();
      } catch {
        return finish({ status: 'unavailable' }, `${auditReason}; rules-only fallback failed`);
      }
      return finish({ status: 'rules_only', value, reason }, auditReason);
    };

    const invalid = (reason: string): Promise<GatewayResult<T>> => {
      const redacted = redact(reason);
      if (task.rulesOnly === undefined) {
        return finish({ status: 'invalid', reason: redacted, ...totals() }, redacted);
      }
      let value: T;
      try {
        value = task.rulesOnly();
      } catch {
        return finish({ status: 'unavailable' }, 'rules-only fallback failed');
      }
      return finish({ status: 'rules_only', value, reason: 'invalid' }, redacted);
    };

    if (binding === undefined || budget === undefined) {
      return fallback('unavailable', 'no adapter for agent');
    }
    let available = false;
    try {
      available = await binding.adapter.available();
    } catch {
      available = false;
    }
    if (!available) return fallback('unavailable', 'provider unavailable');
    if (globalBudget.exhausted() || budget.exhausted()) {
      return fallback('budget', 'budget exhausted');
    }

    // Transport errors are retried from config. The raw error never reaches a log or an audit event.
    const call = async (text: string, triesLeft: number): Promise<GeneratedObject | undefined> => {
      try {
        return await binding.adapter.generateObject({
          system,
          prompt: text,
          schema: task.schema,
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch {
        return triesLeft > 0 ? call(text, triesLeft - 1) : undefined;
      }
    };

    const generate = async (text: string): Promise<Attempt<T>> => {
      const response = await call(text, config.maxRetries);
      if (response === undefined) return { kind: 'failed' };
      let charged: number;
      try {
        charged = budget.record(response.model, response.usage);
        globalBudget.record(response.model, response.usage);
      } catch {
        return { kind: 'unpriced' };
      }
      total.in += response.usage.in;
      total.out += response.usage.out;
      cost += charged;
      model = response.model;

      if ('validationError' in response) {
        return { kind: 'invalid', reason: response.validationError };
      }
      const parsed = task.schema.safeParse(response.object);
      let problem: string | undefined;
      if (parsed.success) {
        try {
          problem = task.validate(parsed.data);
        } catch (error) {
          problem = messageOf(error);
        }
        if (problem === undefined) return { kind: 'ok', value: parsed.data };
      } else {
        problem = parsed.error.message;
      }
      return { kind: 'invalid', reason: problem ?? 'invalid output' };
    };

    const first = await generate(prompt);
    if (first.kind === 'unpriced') {
      return fallback('unavailable', 'model missing from price table');
    }
    let final: Attempt<T> = first;
    if (first.kind === 'invalid') {
      // The first attempt may have used the last of a budget. Do not spend on a second call.
      if (globalBudget.exhausted() || budget.exhausted()) {
        return fallback('budget', 'budget exhausted before validation retry');
      }
      final = await generate(
        `${prompt}\n\n<validation_error>${redact(first.reason)}</validation_error>\nReturn corrected JSON only.`,
      );
      if (final.kind === 'unpriced') {
        return fallback('unavailable', 'model missing from price table');
      }
    }
    if (final.kind === 'ok') {
      return finish({ status: 'ok', value: final.value, model, ...totals() });
    }
    if (final.kind === 'failed') return fallback('unavailable', 'transport failure');
    return invalid(final.reason);
  }

  return { run, globalBudget, perAgent };
}
export type Gateway = ReturnType<typeof createGateway>;
