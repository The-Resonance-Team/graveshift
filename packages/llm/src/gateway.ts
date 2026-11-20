import { redact } from '@graveshift/redactor';

import { type Budget, createBudget } from './budget';
import type {
  AuditEvent,
  LlmConfig,
  LlmProvider,
  LlmResult,
  LlmTask,
  Skipped,
  Usage,
} from './types';

export interface GatewayOptions {
  providers: LlmProvider[];
  config: Pick<LlmConfig, 'timeoutMs' | 'maxRetries' | 'priceTableUsdPer1M'>;
  dailyBudgetUsd: number;
  budget?: Budget;
  onAudit?: (event: AuditEvent) => void;
  now?: () => Date;
}

type Attempt<T> =
  | { kind: 'ok'; value: T; model: string; usage: Usage; cost: number }
  | { kind: 'invalid'; reason: string }
  | { kind: 'failed' };

type Generated = Awaited<ReturnType<LlmProvider['generateObject']>>;
const NO_USAGE: Usage = { in: 0, out: 0 };

export function createGateway(options: GatewayOptions) {
  const { providers, config, onAudit } = options;
  const budget =
    options.budget ?? createBudget(options.dailyBudgetUsd, config.priceTableUsdPer1M, options.now);

  async function run<T>(task: LlmTask<T>): Promise<LlmResult<T>> {
    const system = redact(task.system);
    const prompt = redact(task.prompt);
    const skipped: Skipped[] = [];

    const call = async (
      provider: LlmProvider,
      text: string,
      triesLeft: number,
    ): Promise<Generated | undefined> => {
      try {
        return await provider.generateObject({
          system,
          prompt: text,
          schema: task.schema,
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch {
        return triesLeft > 0 ? call(provider, text, triesLeft - 1) : undefined;
      }
    };

    // one call, validated against schema and evidence; transport errors are retried per config
    const attempt = async (
      provider: LlmProvider,
      text: string,
    ): Promise<Attempt<T> & { usage?: Usage }> => {
      const response = await call(provider, text, config.maxRetries);
      if (!response) return { kind: 'failed' };
      const cost = budget.record(response.model, response.usage);
      const parsed = task.schema.safeParse(response.object);
      const problem = parsed.success ? task.validate?.(parsed.data) : parsed.error.message;
      if (parsed.success && !problem) {
        return {
          kind: 'ok',
          value: parsed.data,
          model: response.model,
          usage: response.usage,
          cost,
        };
      }
      return { kind: 'invalid', reason: problem ?? 'invalid output', usage: response.usage };
    };

    // schema or evidence failure: retry once with the reason, then give up on this task
    const validated = async (provider: LlmProvider): Promise<Attempt<T>> => {
      const first = await attempt(provider, prompt);
      if (first.kind !== 'invalid') return first;
      const second = await attempt(
        provider,
        `${prompt}\n\n<validation_error>${redact(first.reason)}</validation_error>\nReturn corrected JSON only.`,
      );
      return second;
    };

    const finish = (result: LlmResult<T>, usage: Usage = NO_USAGE, cost = 0): LlmResult<T> => {
      onAudit?.({
        task: task.name,
        status: result.status,
        ...('provider' in result ? { provider: result.provider } : {}),
        ...('model' in result ? { model: result.model } : {}),
        tokensIn: usage.in,
        tokensOut: usage.out,
        costUsd: cost,
        skipped,
      });
      return result;
    };

    const from = async (index: number): Promise<LlmResult<T>> => {
      const provider = providers[index];
      if (!provider) {
        return task.rulesOnly
          ? finish({ status: 'rules_only', value: task.rulesOnly(), skipped })
          : finish({ status: 'unavailable', skipped });
      }
      if (!(await provider.available())) {
        skipped.push({ provider: provider.name, reason: 'unavailable' });
        return from(index + 1);
      }
      if (provider.paid && budget.exhausted()) {
        skipped.push({ provider: provider.name, reason: 'budget' });
        return from(index + 1);
      }
      const result = await validated(provider);
      if (result.kind === 'failed') {
        skipped.push({ provider: provider.name, reason: 'failed' });
        return from(index + 1);
      }
      if (result.kind === 'invalid') {
        // last safety net: an invalid model answer must not block a diagnosis
        if (task.rulesOnly) {
          return finish({ status: 'rules_only', value: task.rulesOnly(), skipped });
        }
        return finish({
          status: 'invalid',
          reason: result.reason,
          provider: provider.name,
          skipped,
        });
      }
      return finish(
        {
          status: 'ok',
          value: result.value,
          provider: provider.name,
          model: result.model,
          usage: result.usage,
          costUsd: result.cost,
          skipped,
        },
        result.usage,
        result.cost,
      );
    };

    return from(0);
  }

  return { run, budget };
}
export type LlmGateway = ReturnType<typeof createGateway>;
