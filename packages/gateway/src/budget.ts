import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

import { GatewayConfigError, type Usage } from './types';

type PriceTable = Record<string, { in: number; out: number }>;

export interface BudgetSnapshot {
  readonly day: string;
  readonly limitUsd: number;
  readonly spentUsd: number | null;
  readonly exhausted: boolean;
}

// ponytail: per-process UTC counters; persist if restarts must retain spend, reserve if parallel calls must not overshoot
export function createDailyBudget(
  limitUsd: number,
  prices: PriceTable,
  now: () => Date = () => new Date(),
) {
  // The budget day is UTC accounting time; TZDate keeps the boundary explicit.
  const day = () => format(new TZDate(now(), 'UTC'), 'yyyy-MM-dd');
  let current = day();
  let spent = 0;
  let unknown = false;
  const roll = () => {
    const today = day();
    if (today !== current) {
      current = today;
      spent = 0;
      unknown = false;
    }
  };
  return {
    exhausted(): boolean {
      roll();
      return unknown || spent >= limitUsd;
    },
    record(model: string, usage: Usage): number {
      const price = prices[model];
      if (!Object.hasOwn(prices, model) || price === undefined) {
        throw new GatewayConfigError(`model ${model} is missing from the price table`);
      }
      roll();
      const cost = (usage.in * price.in + usage.out * price.out) / 1_000_000;
      if (!Number.isFinite(cost)) throw new GatewayConfigError('model usage cannot be priced');
      spent += cost;
      return cost;
    },
    unpriced(): void {
      roll();
      unknown = true;
    },
    snapshot(): BudgetSnapshot {
      roll();
      return Object.freeze({
        day: current,
        limitUsd,
        spentUsd: unknown ? null : spent,
        exhausted: unknown || spent >= limitUsd,
      });
    },
  };
}
