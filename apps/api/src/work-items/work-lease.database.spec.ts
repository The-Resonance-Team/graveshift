import { describe, expect, spyOn, test } from 'bun:test';
import { addSeconds, differenceInMilliseconds, subMinutes } from 'date-fns';

import { dbTestEnabled } from '../../test/database/fixtures';
import { attemptFence, setupWorkDatabase, workCaller } from './testing/work-db.fixture';

const owner = { ...workCaller(), workerId: 'worker-1' };
const recovery = { ...owner, workerId: 'worker-2' };
const intent = { repo: 'owner/repo', branch: 'graveshift/work-1', baseSha: 'base-sha' };

describe.skipIf(!dbTestEnabled)('Postgres Work item execution lease', () => {
  const fixture = setupWorkDatabase();

  async function expire() {
    const attempt = (await fixture.read()).activeAttempt;
    if (!attempt) throw new Error('Expected an active attempt');
    await fixture.db.fixAttempt.update({
      where: { id: attempt.id },
      data: { leaseUntil: subMinutes(new Date(), 1) },
    });
    return fixture.read();
  }

  test('Fix now promotes at admission and retains priority after a policy denial', async () => {
    const claimed = await fixture.claim(owner);
    expect(claimed).toMatchObject({
      kind: 'claimed',
      snapshot: { item: { fixPriority: 0 } },
      attempt: { workerId: owner.workerId },
    });
    const snapshot = await fixture.read();
    const lease = snapshot.activeAttempt?.leaseUntil;
    if (!lease) throw new Error('Expected execution lease');
    expect(differenceInMilliseconds(new Date(lease), new Date())).toBeGreaterThan(25_000);
    await fixture.repo.finish({
      caller: owner,
      id: 'work-1',
      input: {
        ...attemptFence(snapshot),
        state: 'failed',
        outcome: {
          ok: false,
          effect: 'deny',
          pr: null,
          reason: 'low_confidence',
          failure: 'policy_denied',
          routing: null,
        },
      },
    });
    expect((await fixture.read()).item.fixPriority).toBe(0);
  });

  test('Human and stale claims do not change queue priority', async () => {
    await fixture.repo.saveTriage({
      caller: workCaller('human'),
      id: 'work-1',
      input: {
        expectedVersion: 0,
        body: { assignee: 'needs_human' },
      },
    });
    await expect(fixture.claim(owner)).rejects.toMatchObject({ code: 'MANUAL_ASSIGNMENT' });
    expect((await fixture.read()).item.fixPriority).toBe(100);
    await expect(
      fixture.repo.claim({
        caller: owner,
        id: 'work-1',
        input: {
          expectedVersion: 0,
          command: { kind: 'fix_now', body: {} },
        },
      }),
    ).rejects.toMatchObject({ code: 'STATE_CHANGED' });
    expect((await fixture.read()).item.fixPriority).toBe(100);
  });

  test('heartbeat extends only the live owner lease without changing versions, update time, or audit', async () => {
    await fixture.claim(owner);
    const active = (await fixture.read()).activeAttempt;
    if (!active) throw new Error('Expected an active attempt');
    await fixture.db.fixAttempt.update({
      where: { id: active.id },
      data: { leaseUntil: addSeconds(new Date(), 5) },
    });
    const before = await fixture.read();
    expect(
      await fixture.repo.heartbeat({
        caller: owner,
        id: 'work-1',
        input: {
          attemptId: active.id,
          workerId: owner.workerId,
        },
      }),
    ).toEqual({ renewed: true });
    const after = await fixture.read();
    expect(after.version).toBe(before.version);
    expect(after.activeAttempt?.version).toBe(before.activeAttempt?.version);
    expect(after.activeAttempt?.updatedAt).toBe(before.activeAttempt?.updatedAt);
    expect(
      differenceInMilliseconds(new Date(after.activeAttempt!.leaseUntil!), new Date()),
    ).toBeGreaterThan(25_000);
    expect(
      await fixture.repo.heartbeat({
        caller: recovery,
        id: 'work-1',
        input: {
          attemptId: active.id,
          workerId: recovery.workerId,
        },
      }),
    ).toEqual({ renewed: false });
    expect(await fixture.audit.list('project-1')).toHaveLength(1);
  });

  test.each(['claimed', 'running'] as const)(
    'an expired %s attempt can be abandoned once and a new command can claim',
    async (state) => {
      await fixture.claim(owner);
      const active = (await fixture.read()).activeAttempt;
      if (!active) throw new Error('Expected an active attempt');
      await fixture.db.fixAttempt.update({ where: { id: active.id }, data: { state } });
      const snapshot = await expire();
      await expect(
        fixture.repo.beginPublication({
          caller: owner,
          id: 'work-1',
          input: { ...attemptFence(snapshot), intent },
        }),
      ).rejects.toMatchObject({ code: 'LEASE_EXPIRED' });
      expect(
        await fixture.repo.heartbeat({
          caller: owner,
          id: 'work-1',
          input: {
            attemptId: active.id,
            workerId: owner.workerId,
          },
        }),
      ).toEqual({ renewed: false });
      const result = await fixture.repo.abandon({
        caller: recovery,
        id: 'work-1',
        input: attemptFence(snapshot),
      });
      expect(result).toMatchObject({
        attemptId: active.id,
        failure: 'fix_error',
        reason: 'Execution interrupted before publication',
      });
      expect((await fixture.read()).activeAttempt).toBeUndefined();
      await expect(
        fixture.repo.abandon({ caller: recovery, id: 'work-1', input: attemptFence(snapshot) }),
      ).rejects.toMatchObject({ code: 'STATE_CHANGED' });
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
      await fixture.claim({ ...workCaller('new-command'), workerId: 'worker-3' });
      await expect(
        fixture.repo.beginPublication({
          caller: owner,
          id: 'work-1',
          input: { ...attemptFence(snapshot), intent },
        }),
      ).rejects.toMatchObject({ code: 'STATE_CHANGED' });
      expect(await fixture.db.fixAttempt.count()).toBe(2);
    },
  );

  test('a live owner and a publishing intent cannot be abandoned', async () => {
    await fixture.claim(owner);
    await expect(
      fixture.repo.abandon({
        caller: recovery,
        id: 'work-1',
        input: attemptFence(await fixture.read()),
      }),
    ).rejects.toMatchObject({ code: 'LEASE_ACTIVE' });
    await fixture.repo.beginPublication({
      caller: owner,
      id: 'work-1',
      input: {
        ...attemptFence(await fixture.read()),
        intent,
      },
    });
    const expired = await expire();
    await expect(
      fixture.repo.abandon({ caller: recovery, id: 'work-1', input: attemptFence(expired) }),
    ).rejects.toMatchObject({ code: 'STATE_CHANGED' });
    expect((await fixture.read()).activeAttempt?.publication).toEqual(intent);
  });

  test('a saved question has no execution lease and its complete answer receives a new owner', async () => {
    await fixture.question();
    const snapshot = await fixture.read();
    const attempt = snapshot.activeAttempt;
    if (!attempt?.questionId) throw new Error('Expected saved question');
    expect(attempt).toMatchObject({ workerId: null, leaseUntil: null, state: 'awaiting_answer' });
    await expect(
      fixture.repo.abandon({ caller: recovery, id: 'work-1', input: attemptFence(snapshot) }),
    ).rejects.toMatchObject({ code: 'STATE_CHANGED' });
    const answerCaller = { ...workCaller('answer-1'), workerId: 'answer-worker' };
    const answer = await fixture.repo.applyAnswer({
      caller: answerCaller,
      id: 'work-1',
      input: {
        expectedVersion: snapshot.version,
        attemptVersion: attempt.version,
        body: {
          attemptId: attempt.id,
          questionId: attempt.questionId,
          params: { INCIDENT: 'OOM' },
        },
      },
    });
    expect(answer).toMatchObject({
      kind: 'claimed',
      attempt: { id: attempt.id, workerId: 'answer-worker', trigger: 'fix_now' },
    });
    await expect(
      fixture.repo.beginPublication({
        caller: owner,
        id: 'work-1',
        input: {
          ...attemptFence(await fixture.read()),
          intent,
        },
      }),
    ).rejects.toMatchObject({ code: 'WORKER_CHANGED' });
  });

  test('abandon rolls back its state change and command result when audit fails', async () => {
    await fixture.claim(owner);
    const snapshot = await expire();
    const append = spyOn(fixture.audit, 'appendInTx').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );
    try {
      await expect(
        fixture.repo.abandon({ caller: recovery, id: 'work-1', input: attemptFence(snapshot) }),
      ).rejects.toThrow('audit unavailable');
    } finally {
      append.mockRestore();
    }
    expect(await fixture.read()).toEqual(snapshot);
    await expect(
      fixture.repo.replay({ caller: recovery, id: 'work-1', input: { kind: 'fix_now', body: {} } }),
    ).rejects.toMatchObject({ code: 'COMMAND_IN_PROGRESS' });
  });
});
