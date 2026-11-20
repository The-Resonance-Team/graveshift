import type { Usage } from './types';

type PriceTable = Record<string, { in: number; out: number }>;

// ponytail: in-memory per-process daily budget, upgrade to a persisted counter if the daemon restarts mid-day
export function createBudget(
  dailyUsd: number,
  prices: PriceTable,
  now: () => Date = () => new Date(),
) {
  let day = now().toISOString().slice(0, 10);
  let spent = 0;
  const roll = () => {
    const today = now().toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      spent = 0;
    }
  };
  return {
    exhausted(): boolean {
      roll();
      return spent >= dailyUsd;
    },
    record(model: string, usage: Usage): number {
      roll();
      const price = prices[model] ?? { in: 0, out: 0 };
      const cost = (usage.in * price.in + usage.out * price.out) / 1_000_000;
      spent += cost;
      return cost;
    },
    spentUsd: () => spent,
  };
}
export type Budget = ReturnType<typeof createBudget>;
