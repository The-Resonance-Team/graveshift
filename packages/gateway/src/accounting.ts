import { AgentConfigSchema } from '@graveshift/agents';

import { createDailyBudget, type BudgetSnapshot } from './budget';
import type { GatewayConfig } from './config';
import {
  GatewayConfigError,
  type AgentBinding,
  type CallTotals,
  type GeneratedObject,
} from './types';

export interface GatewayBudgets {
  readonly global: BudgetSnapshot;
  readonly agents: Readonly<Record<string, BudgetSnapshot>>;
}

const isTokenCount = (value: number | undefined): value is number =>
  value !== undefined && Number.isSafeInteger(value) && value >= 0;

export function createAccounting(
  agents: readonly AgentBinding[],
  config: GatewayConfig,
  now?: () => Date,
) {
  const global = createDailyBudget(config.globalDailyBudgetUsd, config.priceTableUsdPer1M, now);
  const bindings = new Map<string, AgentBinding>();
  const budgets = new Map<string, ReturnType<typeof createDailyBudget>>();
  for (const binding of agents) {
    const agent = AgentConfigSchema.parse(binding.agent);
    if (bindings.has(agent.name))
      throw new GatewayConfigError(`duplicate agent name: ${agent.name}`);
    if (agent.model !== binding.adapter.model || agent.provider !== binding.adapter.provider) {
      throw new GatewayConfigError(`adapter does not match agent: ${agent.name}`);
    }
    if (!Object.hasOwn(config.priceTableUsdPer1M, agent.model)) {
      throw new GatewayConfigError(`model ${agent.model} is missing from the price table`);
    }
    bindings.set(agent.name, { agent, adapter: binding.adapter });
    budgets.set(
      agent.name,
      createDailyBudget(agent.dailyBudgetUsd, config.priceTableUsdPer1M, now),
    );
  }
  return {
    binding: (name: string) => bindings.get(name),
    snapshot(): GatewayBudgets {
      return Object.freeze({
        global: global.snapshot(),
        agents: Object.freeze(
          Object.fromEntries([...budgets].map(([name, budget]) => [name, budget.snapshot()])),
        ),
      });
    },
    open(name: string) {
      const budget = budgets.get(name);
      const callId = crypto.randomUUID();
      const usage = { in: 0, out: 0 };
      let costUsd: number | null = 0;
      let model: string | undefined;
      const unpriced = (): false => {
        costUsd = null;
        global.unpriced();
        budget?.unpriced();
        return false;
      };
      return {
        totals: (): CallTotals => ({ callId, usage: { ...usage }, costUsd }),
        model: () => model,
        exhausted: () => global.exhausted() || budget?.exhausted() === true,
        record(response: GeneratedObject): boolean {
          const input = response.usage.in;
          const output = response.usage.out;
          if (isTokenCount(input)) usage.in += input;
          if (isTokenCount(output)) usage.out += output;
          model = response.model;
          if (
            budget === undefined ||
            !Object.hasOwn(config.priceTableUsdPer1M, model) ||
            !isTokenCount(input) ||
            !isTokenCount(output)
          )
            return unpriced();
          try {
            const reported = { in: input, out: output };
            const cost = budget.record(model, reported);
            global.record(model, reported);
            if (costUsd !== null) costUsd += cost;
            return true;
          } catch {
            return unpriced();
          }
        },
      };
    },
  };
}
