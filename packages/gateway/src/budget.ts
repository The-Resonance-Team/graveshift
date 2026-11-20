import { GatewayConfigError, type Usage } from './types';

type PriceTable = Record<string, { in: number; out: number }>;

// ponytail: in-memory per-process UTC day counters, upgrade to a persisted counter if the daemon restarts mid-day
export function createDailyBudget(
  limitUsd: number,
  prices: PriceTable,
  now: () => Date = () => new Date(),
) {
  const day = () => now().toISOString().slice(0, 10);
  let current = day();
  let spent = 0;
  const roll = () => {
    const today = day();
    if (today !== current) {
      current = today;
      spent = 0;
    }
  };
  return {
    exhausted(): boolean {
      roll();
      return spent >= limitUsd;
    },
    record(model: string, usage: Usage): number {
      const price = prices[model];
      if (price === undefined) {
        throw new GatewayConfigError(`model ${model} is missing from the price table`);
      }
      roll();
      const cost = (usage.in * price.in + usage.out * price.out) / 1_000_000;
      spent += cost;
      return cost;
    },
    spentUsd: () => spent,
  };
}
export type DailyBudget = ReturnType<typeof createDailyBudget>;
