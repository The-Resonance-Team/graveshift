import type { WorkItem } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import { WorkItemStore } from '../work-items/work-item.store';
import { createLocalFixContextProvider } from './fix.context';
import { baseItem } from './fix.test-helpers';

const NOW = new Date('2026-11-22T12:00:00.000Z');

const diagnosed: WorkItem = {
  ...baseItem,
  labels: ['triaged', 'confidence:0.9', 'category:code_bug', 'signal:oom_killed'],
};

function storeWith(...items: WorkItem[]) {
  return new WorkItemStore(items);
}

function provider(store: WorkItemStore, spent = 0) {
  return createLocalFixContextProvider({
    store,
    spendTodayUsd: () => spent,
    now: () => NOW,
  });
}

describe('createLocalFixContextProvider', () => {
  test('builds the context from real triage labels and store data', async () => {
    const other: WorkItem = {
      ...baseItem,
      id: 'wi-0',
      draftPr: {
        repo: 'xiro/haunted-candy-shop',
        number: 3,
        url: 'https://github.test/3',
        branch: 'refs/heads/graveshift/other',
        headSha: 'a'.repeat(40),
        openedAt: '2026-11-22T11:30:00.000Z',
      },
    };
    const loaded = await provider(storeWith(other), 1.25).load(diagnosed);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value).toEqual({
      confidence: 0.9,
      category: 'code_bug',
      signals: ['code_bug', 'oom_killed'],
      counters: {
        actionsLast10Min: 0,
        openPrsLastHour: 1,
        diagnosisLoops: 0,
        llmSpentTodayUsd: 1.25,
      },
    });
  });

  test('a PR older than one hour and the item itself do not count', async () => {
    const stalePr: WorkItem = {
      ...baseItem,
      id: 'wi-old',
      draftPr: {
        repo: 'xiro/haunted-candy-shop',
        number: 2,
        url: 'https://github.test/2',
        branch: 'refs/heads/graveshift/old',
        headSha: 'b'.repeat(40),
        openedAt: '2026-11-22T10:00:00.000Z',
      },
    };
    const self: WorkItem = { ...diagnosed, ...stalePr, id: 'wi-1' };
    const loaded = await provider(storeWith(stalePr, self)).load(diagnosed);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.counters.openPrsLastHour).toBe(0);
  });

  test('the classified category stays a signal when no signal label exists', async () => {
    const loaded = await provider(new WorkItemStore([])).load({
      ...diagnosed,
      labels: ['confidence:0.7', 'category:config_error'],
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.signals).toEqual(['config_error']);
  });

  test('missing or malformed triage labels fail closed', async () => {
    const cases: Array<[string, WorkItem]> = [
      ['no labels', { ...diagnosed, labels: [] }],
      ['no confidence', { ...diagnosed, labels: ['category:code_bug'] }],
      ['no category', { ...diagnosed, labels: ['confidence:0.9'] }],
      ['confidence over one', { ...diagnosed, labels: ['confidence:9', 'category:code_bug'] }],
      [
        'confidence not a number',
        { ...diagnosed, labels: ['confidence:high', 'category:code_bug'] },
      ],
      ['empty confidence value', { ...diagnosed, labels: ['confidence:', 'category:code_bug'] }],
      ['empty category value', { ...diagnosed, labels: ['confidence:0.9', 'category:'] }],
    ];
    const outcomes = await Promise.all(
      cases.map(([name, item]) =>
        provider(new WorkItemStore([]))
          .load(item)
          .then((loaded) => [name, loaded] as const),
      ),
    );
    for (const [name, loaded] of outcomes) {
      expect(loaded.ok, name).toBe(false);
      if (loaded.ok) continue;
      expect(loaded.reason, name).toStartWith('context_unavailable:');
    }
  });
});
