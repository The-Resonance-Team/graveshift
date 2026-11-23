import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { fakeClient, repo } from './test-helpers';
import { checkState, type PrEvent, watchPr } from './watch';

describe('check-run polling and merge detection', () => {
  const pr = { repo: repo.repo, number: 42, url: 'u', branch: 'b', headSha: 'commit-sha' };

  test('property: check state is pending if anything is incomplete, failure if any failed, else success', () => {
    const run = fc.record({
      status: fc.constantFrom('queued', 'in_progress', 'completed'),
      conclusion: fc.constantFrom('success', 'failure', 'neutral', null),
    });
    fc.assert(
      fc.property(fc.array(run, { maxLength: 6 }), (runs) => {
        const state = checkState(runs);
        if (runs.some((r) => r.status !== 'completed')) expect(state).toBe('pending');
        else if (runs.some((r) => r.conclusion === 'failure')) expect(state).toBe('failure');
        else expect(state).toBe('success');
      }),
    );
  });

  test('polls on the interval, reports checks, and stops after an external merge', async () => {
    const { client, calls } = fakeClient({
      checks: [
        [{ name: 'ci', status: 'in_progress', conclusion: null }],
        [{ name: 'ci', status: 'completed', conclusion: 'success' }],
      ],
      pr: [
        { state: 'open', merged: false, headSha: 'commit-sha' },
        { state: 'open', merged: false, headSha: 'commit-sha' },
        { state: 'closed', merged: true, headSha: 'commit-sha' },
      ],
    });
    const events: PrEvent[] = [];
    const sleeps: number[] = [];
    const done = Promise.withResolvers<void>();
    watchPr({
      client,
      pr,
      onEvent: (e) => {
        events.push(e);
        if (e.type === 'merged_externally') done.resolve();
      },
      sleep: async (ms) => void sleeps.push(ms),
    });
    await done.promise;
    expect(events.map((e) => (e.type === 'checks' ? e.state : e.type))).toEqual([
      'pending',
      'success',
      'merged_externally',
    ]);
    expect(sleeps).toEqual([30_000, 30_000]);
    expect(calls.some((c) => /merge/i.test(c.method) && c.method !== 'getPullRequest')).toBe(false);
  });

  test('a closed, unmerged PR stops the watch', async () => {
    const { client } = fakeClient({ pr: [{ state: 'closed', merged: false, headSha: 'x' }] });
    const done = Promise.withResolvers<PrEvent>();
    watchPr({ client, pr, onEvent: done.resolve, sleep: async () => {} });
    expect(await done.promise).toEqual({ type: 'closed' });
  });
});
