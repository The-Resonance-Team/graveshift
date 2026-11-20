import { describe, expect, test } from 'bun:test';

import { createDailyBudget } from './budget';

describe('daily budget', () => {
  test('cost adds input and output tokens from the price table', () => {
    const budget = createDailyBudget(10, { m: { in: 2, out: 3 } }, () => new Date());
    expect(budget.record('m', { in: 1_000_000, out: 1_000_000 })).toBe(5);
    expect(budget.spentUsd()).toBe(5);
    expect(budget.exhausted()).toBe(false);
  });

  test('a new UTC day clears the spend', () => {
    let now = new Date('2026-11-20T23:59:00Z');
    const budget = createDailyBudget(1, { m: { in: 1_000_000, out: 0 } }, () => now);
    budget.record('m', { in: 1, out: 0 });
    expect(budget.exhausted()).toBe(true);
    now = new Date('2026-11-21T00:00:01Z');
    expect(budget.exhausted()).toBe(false);
    expect(budget.spentUsd()).toBe(0);
  });
});
