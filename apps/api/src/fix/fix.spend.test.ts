import type { AuditEvent } from '@graveshift/gateway';
import { describe, expect, test } from 'bun:test';

import { SpendTracker } from './fix.spend';

const event = (costUsd: number): AuditEvent => ({
  agent: 'Exorcist',
  task: 'generate_patch',
  status: 'ok',
  tokensIn: 10,
  tokensOut: 5,
  costUsd,
});

describe('SpendTracker', () => {
  test('adds every reported cost for the day', () => {
    const tracker = new SpendTracker(() => new Date('2026-11-22T10:00:00.000Z'));
    tracker.record(event(0.4));
    tracker.record(event(0.6));
    tracker.record(event(0));
    expect(tracker.spendTodayUsd()).toBeCloseTo(1.0);
  });

  test('the ledger resets on the next UTC day', () => {
    let now = new Date('2026-11-22T23:59:00.000Z');
    const tracker = new SpendTracker(() => now);
    tracker.record(event(2));
    expect(tracker.spendTodayUsd()).toBe(2);
    now = new Date('2026-11-23T00:01:00.000Z');
    expect(tracker.spendTodayUsd()).toBe(0);
    tracker.record(event(0.5));
    expect(tracker.spendTodayUsd()).toBe(0.5);
  });
});
