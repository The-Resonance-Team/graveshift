import { describe, expect, spyOn, test } from 'bun:test';

import { dbTestEnabled } from '../../test/database/fixtures';
import { testProjectGrant } from '../internal/testing/project-grant.fixture';
import { ActionRepo } from './action.repo';
import { setupActionsDatabase } from './testing/action-db.fixture';
import { ACTION_TEST_POLICY, completionInput } from './testing/action.fixture';

describe.skipIf(!dbTestEnabled)('durable runtime completion', () => {
  const fixture = setupActionsDatabase();

  test('records one terminal result and audit, and duplicate completion preserves the original', async () => {
    const input = await fixture.input();
    await fixture.repo.claim(input);
    const completion = completionInput(input);
    expect(await fixture.repo.complete(completion)).toEqual({ kind: 'completed' });
    expect(await fixture.repo.complete(completion)).toEqual({
      kind: 'known',
      result: completion.completion.result,
    });
    const changed = completionInput(input, { status: 'failed', reason: 'execution_failed' });
    expect(await fixture.repo.complete(changed)).toEqual({
      kind: 'known',
      result: completion.completion.result,
    });
    const row = await fixture.db.actionClaim.findFirstOrThrow();
    expect(row).toMatchObject({ state: 'completed', result: completion.completion.result });
    expect(row.completedAt).toBeInstanceOf(Date);
    expect((await fixture.audit.list('project-1')).map((entry) => entry.type)).toEqual([
      'actuator.admitted',
      'actuator.executed',
    ]);
    expect(await fixture.audit.verifyChain('project-1')).toEqual({ ok: true, length: 2 });
  });

  test('an absent or mismatched completion cannot create or finish a claim', async () => {
    const input = await fixture.input();
    const completion = completionInput(input);
    expect(await fixture.repo.complete(completion)).toEqual({ kind: 'uncertain' });
    await fixture.repo.claim(input);
    expect(
      await fixture.repo.complete({
        ...completion,
        completion: { ...completion.completion, requestHash: '0'.repeat(64) },
      }),
    ).toEqual({ kind: 'uncertain' });
    expect(
      await fixture.repo.complete({
        ...completion,
        completion: { ...completion.completion, actionId: 'other' },
      }),
    ).toEqual({ kind: 'uncertain' });
    expect((await fixture.db.actionClaim.findFirstOrThrow()).state).toBe('admitted');
    expect(await fixture.db.auditEntry.count()).toBe(1);
  });

  test('terminal audit rollback leaves a consumed uncertain claim and never frees its capacity', async () => {
    const input = await fixture.input();
    await fixture.repo.claim(input);
    const append = spyOn(fixture.audit, 'appendInTx').mockRejectedValueOnce(
      new Error('terminal storage unavailable'),
    );
    try {
      await expect(fixture.repo.complete(completionInput(input))).rejects.toThrow(
        'terminal storage',
      );
    } finally {
      append.mockRestore();
    }
    expect((await fixture.db.actionClaim.findFirstOrThrow()).state).toBe('admitted');
    expect(await fixture.repo.claim(input)).toEqual({ kind: 'uncertain' });
    expect(await fixture.repo.claim(await fixture.input('next'))).toEqual({
      kind: 'denied',
      reason: 'policy_rate_limited',
    });
    expect(await fixture.db.auditEntry.count()).toBe(1);
  });

  test('failed runtime attempts count in the window and remain consumed after the window', async () => {
    const input = await fixture.input();
    await fixture.repo.claim(input);
    const completion = completionInput(input, { status: 'failed', reason: 'execution_failed' });
    await fixture.repo.complete(completion);
    const second = await fixture.input('next');
    expect(await fixture.repo.claim(second)).toEqual({
      kind: 'denied',
      reason: 'policy_rate_limited',
    });
    await fixture.db.actionClaim.updateMany({
      data: { admittedAt: new Date('2000-01-01T00:00:00Z') },
    });
    expect(await fixture.repo.claim(second)).toEqual({ kind: 'claimed' });
    expect(await fixture.repo.claim(input)).toEqual({
      kind: 'known',
      result: completion.completion.result,
    });
    expect(await fixture.db.actionClaim.count()).toBe(2);
  });

  test('the API boot policy and mode are authoritative even when the client would allow execution', async () => {
    const input = await fixture.input();
    const proposing = new ActionRepo(
      fixture.db,
      fixture.audit,
      { policy: ACTION_TEST_POLICY, mode: 'propose' },
      testProjectGrant(['project-1']),
    );
    expect(await proposing.claim(input)).toEqual({ kind: 'denied', reason: 'policy_mode_propose' });
    const stopped = new ActionRepo(
      fixture.db,
      fixture.audit,
      {
        policy: {
          ...ACTION_TEST_POLICY,
          limits: { ...ACTION_TEST_POLICY.limits, maxActionsPerServicePer10Min: 0 },
        },
      },
      testProjectGrant(['project-1']),
    );
    expect(await stopped.claim(input)).toEqual({ kind: 'denied', reason: 'policy_rate_limited' });
    expect(await fixture.db.actionClaim.count()).toBe(0);
  });
});
