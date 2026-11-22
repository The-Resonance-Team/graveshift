import { describe, expect, spyOn, test } from 'bun:test';

import { dbTestEnabled, openTestDatabase } from '../../test/database/fixtures';
import { ActionProjectError } from './action.errors';
import { actionRepo, setupActionsDatabase } from './testing/action-db.fixture';
import { claimInput, completionInput } from './testing/action.fixture';

describe.skipIf(!dbTestEnabled)('durable runtime claim', () => {
  const fixture = setupActionsDatabase();

  test('a new claim and its admission audit commit as one unit', async () => {
    const input = await fixture.input();
    expect(await fixture.repo.claim(input)).toEqual({ kind: 'claimed' });
    const row = await fixture.db.actionClaim.findUniqueOrThrow({
      where: { projectId_tokenId: { projectId: input.projectId, tokenId: 'token-1' } },
    });
    expect(row).toMatchObject({
      projectId: 'project-1',
      tokenId: 'token-1',
      actionId: 'action-token-1',
      requestHash: input.claim.requestHash,
      service: 'api',
      state: 'admitted',
      result: null,
    });
    const audit = await fixture.audit.list('project-1');
    expect(audit.map((entry) => entry.type)).toEqual(['actuator.admitted']);
    expect(await fixture.audit.verifyChain('project-1')).toEqual({ ok: true, length: 1 });
  });

  test('two clients racing the same Blessing receive exactly one new claim', async () => {
    const other = await openTestDatabase();
    try {
      const input = await fixture.input();
      const outcomes = await Promise.all([
        fixture.repo.claim(input),
        actionRepo(other).claim(input),
      ]);
      expect(outcomes.map((result) => result.kind).sort()).toEqual(['claimed', 'uncertain']);
      expect(await fixture.db.actionClaim.count()).toBe(1);
      expect(await fixture.db.auditEntry.count()).toBe(1);
    } finally {
      await other.onModuleDestroy();
    }
  });

  test('two clients with distinct Blessings cannot exceed the per-Grave limit of one', async () => {
    const other = await openTestDatabase();
    try {
      const first = await fixture.input('first');
      const second = await fixture.input('second');
      const outcomes = await Promise.all([
        fixture.repo.claim(first),
        actionRepo(other).claim(second),
      ]);
      expect(outcomes.filter((result) => result.kind === 'claimed')).toHaveLength(1);
      expect(outcomes).toContainEqual({ kind: 'denied', reason: 'policy_rate_limited' });
      expect(await fixture.db.actionClaim.count()).toBe(1);
      expect(await fixture.audit.verifyChain('project-1')).toEqual({ ok: true, length: 1 });
    } finally {
      await other.onModuleDestroy();
    }
  });

  test('two Graves each retain their own capacity across clients', async () => {
    const other = await openTestDatabase();
    try {
      const api = await fixture.input('api');
      const worker = await fixture.input('worker', 'worker');
      expect(await Promise.all([fixture.repo.claim(api), actionRepo(other).claim(worker)])).toEqual(
        [{ kind: 'claimed' }, { kind: 'claimed' }],
      );
      expect(await fixture.db.actionClaim.count()).toBe(2);
      expect(await fixture.audit.verifyChain('project-1')).toEqual({ ok: true, length: 2 });
    } finally {
      await other.onModuleDestroy();
    }
  });

  test('recreated clients never treat a prior admitted or completed claim as new', async () => {
    const input = await fixture.input();
    let fresh = await openTestDatabase();
    try {
      expect(await actionRepo(fresh).claim(input)).toEqual({ kind: 'claimed' });
      await fresh.onModuleDestroy();
      fresh = await openTestDatabase();
      expect(await actionRepo(fresh).claim(input)).toEqual({ kind: 'uncertain' });
      const completion = completionInput(input);
      expect(await actionRepo(fresh).complete(completion)).toEqual({ kind: 'completed' });
      await fresh.onModuleDestroy();
      fresh = await openTestDatabase();
      expect(await actionRepo(fresh).claim(input)).toEqual({
        kind: 'known',
        result: completion.completion.result,
      });
      expect(await fixture.db.actionClaim.count()).toBe(1);
      expect(await fixture.db.auditEntry.count()).toBe(2);
    } finally {
      await fresh.onModuleDestroy();
    }
  });

  test('another token or a changed signed request cannot reclaim an action', async () => {
    const input = await fixture.input();
    await fixture.repo.claim(input);
    const replacement = await fixture.input('replacement', 'api', input.claim.request.action.id);
    expect(await fixture.repo.claim(replacement)).toEqual({ kind: 'uncertain' });
    const changed = await fixture.input('token-1', 'worker', 'changed-action');
    expect(await fixture.repo.claim(changed)).toEqual({ kind: 'uncertain' });
    expect(await fixture.db.actionClaim.count()).toBe(1);
  });

  test('an admission audit failure rolls back token consumption and capacity', async () => {
    const input = await fixture.input();
    const append = spyOn(fixture.audit, 'appendInTx').mockRejectedValueOnce(
      new Error('Bearer rollback-secret'),
    );
    try {
      await expect(fixture.repo.claim(input)).rejects.toThrow('rollback-secret');
    } finally {
      append.mockRestore();
    }
    expect(await fixture.db.actionClaim.count()).toBe(0);
    expect(await fixture.db.auditEntry.count()).toBe(0);
    expect(await fixture.repo.claim(input)).toEqual({ kind: 'claimed' });
  });

  test('expiry is checked against the database clock without consuming tokens', async () => {
    const expired = claimInput(Date.parse('2000-01-01T00:00:00Z'));
    expect(await fixture.repo.claim(expired)).toEqual({ kind: 'denied', reason: 'expired' });
    const future = claimInput(Date.parse('2100-01-01T00:00:00Z'));
    expect(await fixture.repo.claim(future)).toEqual({ kind: 'denied', reason: 'not_yet_valid' });
    expect(await fixture.db.actionClaim.count()).toBe(0);
    expect(await fixture.repo.claim(await fixture.input())).toEqual({ kind: 'claimed' });
  });

  test('unfinished claims keep capacity even after their rate window and TTL expire', async () => {
    const input = await fixture.input();
    await fixture.repo.claim(input);
    await fixture.db.actionClaim.updateMany({
      data: {
        admittedAt: new Date('2000-01-01T00:00:00Z'),
        expiresAt: new Date('2000-01-01T00:15:00Z'),
      },
    });
    expect(await fixture.repo.claim(input)).toEqual({ kind: 'uncertain' });
    expect(await fixture.repo.claim(await fixture.input('second'))).toEqual({
      kind: 'denied',
      reason: 'policy_rate_limited',
    });
    expect(await fixture.db.actionClaim.count()).toBe(1);
  });

  test('projects have separate tokens, action identities and Grave limits', async () => {
    const input = await fixture.input();
    await fixture.repo.claim(input);
    expect(() => fixture.repo.claim({ ...input, projectId: 'project-2' })).toThrow(
      ActionProjectError,
    );
    expect(
      await actionRepo(fixture.db, 'project-2').claim({ ...input, projectId: 'project-2' }),
    ).toEqual({ kind: 'claimed' });
    expect(await fixture.db.actionClaim.count()).toBe(2);
    expect(await fixture.audit.verifyChain('project-2')).toEqual({ ok: true, length: 1 });
  });

  test('the signed request hash is verified before a row or audit can be written', async () => {
    const input = await fixture.input();
    expect(
      await fixture.repo.claim({
        ...input,
        claim: { ...input.claim, requestHash: '0'.repeat(64) },
      }),
    ).toEqual({ kind: 'denied', reason: 'request_hash_mismatch' });
    expect(await fixture.db.actionClaim.count()).toBe(0);
    expect(await fixture.db.auditEntry.count()).toBe(0);
  });
});
