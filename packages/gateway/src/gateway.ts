import { redact } from '@graveshift/redactor';

import { createDailyBudget, type DailyBudget } from './budget';
import { GatewayConfigSchema, type GatewayConfig } from './config';
import type {
  AgentBinding,
  AuditEvent,
  GeneratedObject,
  GatewayResult,
  GatewayTask,
  Usage,
} from './types';

export interface GatewayOptions {
  agents: readonly AgentBinding[];
  config: GatewayConfig;
  onAudit?: (event: AuditEvent) => void;
  now?: () => Date;
}

type Attempt<T> =
  | { kind: 'ok'; value: T; response: GeneratedObject; cost: number }
  | { kind: 'invalid'; reason: string; response: GeneratedObject; cost: number }
  | { kind: 'failed' };

const NO_USAGE: Usage = { in: 0, out: 0 };

export function createGateway(options: GatewayOptions) {
  const config = GatewayConfigSchema.parse(options.config);
  const globalBudget = createDailyBudget(
    config.globalDailyBudgetUsd,
    config.priceTableUsdPer1M,
    options.now,
  );
  const perAgent = new Map<string, DailyBudget>();
  for (const { agent } of options.agents) {
    if (!perAgent.has(agent.name)) {
      perAgent.set(
        agent.name,
        createDailyBudget(agent.dailyBudgetUsd, config.priceTableUsdPer1M, options.now),
      );
    }
  }

  // The result is only redacted, schema-validated data. No tool runs and no permission is granted.
  async function run<T>(task: GatewayTask<T>): Promise<GatewayResult<T>> {
    const system = redact(task.system);
    const prompt = redact(task.prompt);
    const binding: AgentBinding | undefined = options.agents.find(
      (entry) => entry.agent.name === task.agent,
    );
    const budget = perAgent.get(task.agent);

    const finish = (
      result: GatewayResult<T>,
      usage: Usage = NO_USAGE,
      cost = 0,
      model?: string,
      reason?: string,
    ): GatewayResult<T> => {
      options.onAudit?.({
        agent: task.agent,
        task: task.task,
        status: result.status,
        tokensIn: usage.in,
        tokensOut: usage.out,
        costUsd: cost,
        ...(model === undefined ? {} : { model }),
        ...(reason === undefined ? {} : { reason: redact(reason) }),
      });
      return result;
    };

    const unavailable = (reason: string): GatewayResult<T> =>
      task.rulesOnly === undefined
        ? finish({ status: 'unavailable' }, NO_USAGE, 0, undefined, reason)
        : finish(
            { status: 'rules_only', value: task.rulesOnly(), reason: 'unavailable' },
            NO_USAGE,
            0,
            undefined,
            reason,
          );

    if (binding === undefined || budget === undefined) return unavailable('no adapter for agent');
    if (!(await binding.adapter.available())) return unavailable('provider unavailable');
    if (globalBudget.exhausted() || budget.exhausted()) {
      return task.rulesOnly === undefined
        ? finish({ status: 'unavailable' }, NO_USAGE, 0, undefined, 'budget exhausted')
        : finish(
            { status: 'rules_only', value: task.rulesOnly(), reason: 'budget' },
            NO_USAGE,
            0,
            undefined,
            'budget exhausted',
          );
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
      const cost = budget.record(response.model, response.usage);
      globalBudget.record(response.model, response.usage);
      const parsed = task.schema.safeParse(response.object);
      const problem = parsed.success ? task.validate?.(parsed.data) : redact(parsed.error.message);
      if (parsed.success && problem === undefined) {
        return { kind: 'ok', value: parsed.data, response, cost };
      }
      return { kind: 'invalid', reason: problem ?? 'invalid output', response, cost };
    };

    const outcome = (final: Attempt<T>): GatewayResult<T> => {
      if (final.kind === 'ok') {
        return {
          status: 'ok',
          value: final.value,
          model: final.response.model,
          usage: final.response.usage,
          costUsd: final.cost,
        };
      }
      if (final.kind === 'failed') {
        return task.rulesOnly === undefined
          ? { status: 'unavailable' }
          : { status: 'rules_only', value: task.rulesOnly(), reason: 'unavailable' };
      }
      return task.rulesOnly === undefined
        ? { status: 'invalid', reason: final.reason }
        : { status: 'rules_only', value: task.rulesOnly(), reason: 'invalid' };
    };

    const first = await generate(prompt);
    // Exactly one validation retry; the reason is redacted before it leaves the gateway.
    const final =
      first.kind === 'invalid'
        ? await generate(
            `${prompt}\n\n<validation_error>${redact(first.reason)}</validation_error>\nReturn corrected JSON only.`,
          )
        : first;
    const result = outcome(final);
    const usage = final.kind === 'failed' ? NO_USAGE : final.response.usage;
    const cost = final.kind === 'failed' ? 0 : final.cost;
    const model = final.kind === 'failed' ? undefined : final.response.model;
    const reason =
      final.kind === 'invalid'
        ? final.reason
        : final.kind === 'failed'
          ? 'transport failure'
          : undefined;
    return finish(result, usage, cost, model, reason);
  }

  return { run, globalBudget, perAgent };
}
export type Gateway = ReturnType<typeof createGateway>;
