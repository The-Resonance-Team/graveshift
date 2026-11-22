import { describe, expect, spyOn, test } from 'bun:test';
import { subMinutes } from 'date-fns';

import { dbTestEnabled } from '../../test/database/fixtures';
import { attemptFence, setupWorkDatabase, workCaller } from './testing/work-db.fixture';

const owner = { ...workCaller(), workerId: 'worker-1' };
const recovery = { ...owner, workerId: 'worker-2' };
const intent = { repo: 'owner/repo', branch: 'graveshift/work-1', baseSha: 'base-sha' };
const pr = {
  repo: intent.repo,
  branch: intent.branch,
  headSha: 'head-sha',
  number: 7,
  url: 'https://github.test/owner/repo/pull/7',
};
const failed = {
  ok: false,
  effect: 'allow' as const,
  pr: null,
  reason: 'stale_base',
  failure: 'pr_failed' as const,
  routing: null,
};

describe.skipIf(!dbTestEnabled)('Postgres Work item publication abort and owner recovery', () => {
  const fixture = setupWorkDatabase();

  async function publishing() {
    await fixture.claim(owner);
    return fixture.repo.beginPublication({
      caller: owner,
      id: 'work-1',
      input: {
        ...attemptFence(await fixture.read()),
        intent,
      },
    });
  }

  test('a known failure before a remote write releases the intent and allows another command', async () => {
    const snapshot = await publishing();
    const result = await fixture.repo.abortPublication({
      caller: owner,
      id: 'work-1',
      input: {
        ...attemptFence(snapshot),
        outcome: failed,
      },
    });
    expect(result).toMatchObject({
      failure: 'pr_failed',
      reason: 'stale_base',
      item: { fixPriority: 0 },
    });
    expect((await fixture.read()).activeAttempt).toBeUndefined();
    expect(
      await fixture.db.fixAttempt.findFirst({ where: { id: result.attemptId! } }),
    ).toMatchObject({ state: 'failed', publication: null });
    expect(
      await fixture.repo.replay({
        caller: recovery,
        id: 'work-1',
        input: { kind: 'fix_now', body: {} },
      }),
    ).toEqual({
      kind: 'fix',
      result,
    });
    await fixture.claim({ ...workCaller('retry'), workerId: 'worker-3' });
    expect(await fixture.db.fixAttempt.count()).toBe(2);
  });

  test('an uncertain publication and a known PR cannot be aborted', async () => {
    const snapshot = await publishing();
    await expect(
      fixture.repo.abortPublication({
        caller: owner,
        id: 'work-1',
        input: {
          ...attemptFence(snapshot),
          outcome: { ...failed, failure: 'publication_uncertain' },
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_OUTCOME' });
    const recorded = await fixture.repo.recordPublication({
      caller: owner,
      id: 'work-1',
      input: {
        ...attemptFence(snapshot),
        pr,
        baseSha: intent.baseSha,
      },
    });
    await expect(
      fixture.repo.abortPublication({
        caller: owner,
        id: 'work-1',
        input: {
          ...attemptFence(recorded),
          outcome: failed,
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_OUTCOME' });
    expect((await fixture.read()).item.draftPr).toEqual(pr);
  });

  test('recovery records a known PR after lease expiry and fences the old publication owner', async () => {
    const snapshot = await publishing();
    await expect(
      fixture.repo.recordPublication({
        caller: recovery,
        id: 'work-1',
        input: {
          ...attemptFence(snapshot),
          pr,
          baseSha: intent.baseSha,
        },
      }),
    ).rejects.toMatchObject({ code: 'WORKER_CHANGED' });
    await fixture.db.fixAttempt.update({
      where: { id: snapshot.activeAttempt!.id },
      data: { leaseUntil: subMinutes(new Date(), 1) },
    });
    const current = await fixture.read();
    const recorded = await fixture.repo.recordPublication({
      caller: recovery,
      id: 'work-1',
      input: {
        ...attemptFence(current),
        pr,
        baseSha: intent.baseSha,
      },
    });
    expect(recorded.activeAttempt?.workerId).toBe(recovery.workerId);
    await expect(
      fixture.repo.finish({
        caller: owner,
        id: 'work-1',
        input: {
          ...attemptFence(recorded),
          state: 'completed',
          outcome: {
            ok: true,
            effect: 'allow',
            pr,
            reason: null,
            failure: 'none',
            routing: null,
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'WORKER_CHANGED' });
    const finished = await fixture.repo.finish({
      caller: recovery,
      id: 'work-1',
      input: {
        ...attemptFence(recorded),
        state: 'completed',
        outcome: {
          ok: true,
          effect: 'allow',
          pr,
          reason: null,
          failure: 'none',
          routing: null,
        },
      },
    });
    expect(finished).toMatchObject({ ok: true, pr });
    expect((await fixture.read()).item.draftPr).toEqual(pr);
  });

  test('publication abort rolls back if its durable audit fails', async () => {
    const snapshot = await publishing();
    const append = spyOn(fixture.audit, 'appendInTx').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );
    try {
      await expect(
        fixture.repo.abortPublication({
          caller: owner,
          id: 'work-1',
          input: {
            ...attemptFence(snapshot),
            outcome: failed,
          },
        }),
      ).rejects.toThrow('audit unavailable');
    } finally {
      append.mockRestore();
    }
    expect(await fixture.read()).toEqual(snapshot);
  });

  test('an attempt already recorded as uncertain keeps its intent and cannot be aborted', async () => {
    const snapshot = await publishing();
    await fixture.repo.finish({
      caller: owner,
      id: 'work-1',
      input: {
        ...attemptFence(snapshot),
        state: 'uncertain',
        outcome: { ...failed, failure: 'publication_uncertain', reason: 'connection_lost' },
      },
    });
    const uncertain = await fixture.read();
    await expect(
      fixture.repo.abortPublication({
        caller: owner,
        id: 'work-1',
        input: {
          ...attemptFence(uncertain),
          outcome: failed,
        },
      }),
    ).rejects.toMatchObject({ code: 'STATE_CHANGED' });
    expect((await fixture.read()).activeAttempt?.publication).toEqual(intent);
  });
});
