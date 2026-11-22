import { describe, expect, spyOn, test } from 'bun:test';

import { dbTestEnabled } from '../../test/database/fixtures';
import { attemptFence, setupWorkDatabase, workCaller } from './testing/work-db.fixture';

const intent = { repo: 'owner/repo', branch: 'graveshift/work-1', baseSha: 'base-sha' };
const pr = {
  repo: intent.repo,
  branch: intent.branch,
  headSha: 'head-sha',
  number: 7,
  url: 'https://github.test/owner/repo/pull/7',
};

describe.skipIf(!dbTestEnabled)('Postgres Work item publication', () => {
  const fixture = setupWorkDatabase();

  test('a saved publication intent blocks another claim until reconciliation', async () => {
    await fixture.claim();
    const publishing = await fixture.repo.beginPublication({
      caller: workCaller(),
      id: 'work-1',
      input: {
        ...attemptFence(await fixture.read()),
        intent,
      },
    });
    expect(publishing.activeAttempt).toMatchObject({
      state: 'publishing',
      publication: intent,
      baseSha: intent.baseSha,
    });
    await fixture.repo.finish({
      caller: workCaller(),
      id: 'work-1',
      input: {
        ...attemptFence(publishing),
        state: 'uncertain',
        outcome: {
          ok: false,
          effect: 'allow',
          pr: null,
          failure: 'publication_uncertain',
          reason: 'connection_lost',
          routing: null,
        },
      },
    });
    await expect(fixture.claim(workCaller('second-fix'))).rejects.toMatchObject({ status: 409 });
    const recorded = await fixture.repo.recordPublication({
      caller: workCaller(),
      id: 'work-1',
      input: {
        ...attemptFence(await fixture.read()),
        pr,
        baseSha: intent.baseSha,
      },
    });
    expect(recorded.item).toMatchObject({ draftPr: pr, fixPriority: 0 });
    const result = await fixture.repo.finish({
      caller: workCaller(),
      id: 'work-1',
      input: {
        ...attemptFence(recorded),
        state: 'completed',
        outcome: {
          ok: true,
          effect: 'allow',
          pr,
          failure: 'none',
          reason: null,
          routing: null,
        },
      },
    });
    expect(result).toMatchObject({ ok: true, pr, trigger: 'fix_now' });
    expect((await fixture.read()).activeAttempt).toBeUndefined();
    expect(
      await fixture.repo.replay({
        caller: workCaller(),
        id: 'work-1',
        input: { kind: 'fix_now', body: {} },
      }),
    ).toEqual({ kind: 'fix', result });
    expect(await fixture.db.fixAttempt.count()).toBe(1);
  });

  test('an unconfirmed remote write cannot be ended as an ordinary failure', async () => {
    await fixture.claim();
    await fixture.repo.beginPublication({
      caller: workCaller(),
      id: 'work-1',
      input: {
        ...attemptFence(await fixture.read()),
        intent,
      },
    });
    await expect(
      fixture.repo.finish({
        caller: workCaller(),
        id: 'work-1',
        input: {
          ...attemptFence(await fixture.read()),
          state: 'failed',
          outcome: {
            ok: false,
            effect: 'allow',
            pr: null,
            failure: 'pr_failed',
            reason: 'connection_lost',
            routing: null,
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_OUTCOME' });
    expect((await fixture.read()).activeAttempt?.state).toBe('publishing');
  });

  test('a known PR survives a later completion audit failure and stale writes are fenced', async () => {
    await fixture.claim();
    const stale = attemptFence(await fixture.read());
    await fixture.repo.beginPublication({
      caller: workCaller(),
      id: 'work-1',
      input: { ...stale, intent },
    });
    await fixture.repo.recordPublication({
      caller: workCaller(),
      id: 'work-1',
      input: {
        ...attemptFence(await fixture.read()),
        pr,
        baseSha: intent.baseSha,
      },
    });
    const fence = attemptFence(await fixture.read());
    const append = spyOn(fixture.audit, 'appendInTx').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );
    try {
      await expect(
        fixture.repo.finish({
          caller: workCaller(),
          id: 'work-1',
          input: {
            ...fence,
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
      ).rejects.toThrow('audit unavailable');
    } finally {
      append.mockRestore();
    }
    expect((await fixture.read()).item.draftPr).toEqual(pr);
    expect((await fixture.read()).activeAttempt?.state).toBe('publishing');
    await expect(
      fixture.repo.beginPublication({
        caller: workCaller(),
        id: 'work-1',
        input: { ...stale, intent },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  test('the known PR is committed even when its post-publication audit handoff fails', async () => {
    await fixture.claim();
    await fixture.repo.beginPublication({
      caller: workCaller(),
      id: 'work-1',
      input: {
        ...attemptFence(await fixture.read()),
        intent,
      },
    });
    const append = spyOn(fixture.audit, 'append').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );
    try {
      await expect(
        fixture.repo.recordPublication({
          caller: workCaller(),
          id: 'work-1',
          input: {
            ...attemptFence(await fixture.read()),
            pr,
            baseSha: intent.baseSha,
          },
        }),
      ).rejects.toThrow('audit unavailable');
    } finally {
      append.mockRestore();
    }
    expect((await fixture.read()).item.draftPr).toEqual(pr);
    expect((await fixture.read()).activeAttempt?.publication).toEqual(pr);
  });
});
