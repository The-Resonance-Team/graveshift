import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuditDraft } from '@graveshift/core';
import { expect, test } from 'bun:test';

import { createDurableAdmission } from './admission-durable';
import * as claims from './claims';
import { policy, setup, signed, T0 } from './test-helpers';

async function withStore<T>(
  task: (ctx: {
    admission: claims.RequiredAdmission;
    audits: AuditDraft[];
    setNow: (ms: number) => void;
  }) => Promise<T>,
  options: Partial<Pick<claims.AdmissionRules, 'maxTrackedActions' | 'blocked'>> = {},
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'graveshift-actuator-'));
  let now = T0;
  const audits: AuditDraft[] = [];
  const admission = createDurableAdmission(join(dir, 'admission.db'), {
    policy,
    now: () => now,
    audit: async (draft) => {
      audits.push(structuredClone(draft));
      return { key: draft.key };
    },
    ...options,
  });
  try {
    return await task({ admission, audits, setNow: (ms) => (now = ms) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a restart does not allow the same approval token to run twice', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'graveshift-actuator-'));
  const path = join(dir, 'admission.db');
  try {
    const requiredAudit = async (draft: { key: string }) => ({ key: draft.key });
    const rules = { policy, now: () => T0, audit: requiredAudit };
    const first = setup(T0, {
      durableAdmission: createDurableAdmission(path, rules),
    });
    expect((await first.actuator.execute(signed())).status).toBe('executed');

    // A new process opens the same file. The consumed token is still present.
    const restarted = setup(T0, {
      durableAdmission: createDurableAdmission(path, rules),
    });
    const result = await restarted.actuator.execute(signed());
    expect(result).toMatchObject({
      status: 'denied',
      reason: 'already_completed',
      knownResult: { status: 'executed', reason: 'executed' },
    });
    expect(restarted.calls).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an unopenable admission store path throws at construction', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'graveshift-actuator-'));
  try {
    // A directory is not a SQLite file. Startup must fail here, not at first action.
    expect(() =>
      createDurableAdmission(dir, {
        policy,
        now: () => T0,
        audit: async (draft) => ({ key: draft.key }),
      }),
    ).toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a second token for the same action cannot run the effect after the rate window', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'graveshift-actuator-'));
  let now = T0;
  const rules = {
    policy,
    now: () => now,
    audit: async (draft: { key: string }) => ({ key: draft.key }),
  };
  try {
    const admission = createDurableAdmission(join(dir, 'admission.db'), rules);
    const first = setup(T0, { durableAdmission: admission });
    expect((await first.actuator.execute(signed())).status).toBe('executed');
    now = T0 + 11 * 60_000;
    const second = setup(now, { durableAdmission: admission });
    expect(
      await second.actuator.execute(
        signed({ tokenId: 'other', actionId: 'act-1', issuedOffset: 11 * 60_000 }),
      ),
    ).toMatchObject({ status: 'denied', reason: 'execution_uncertain' });
    expect(second.calls).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('SQLite counts the service rate and capacity exactly like the in-memory adapter', async () => {
  await withStore(async ({ admission }) => {
    expect(await admission.claim(claims.runtimeClaim(signed()))).toEqual({ kind: 'claimed' });
    expect(await admission.claim(claims.runtimeClaim(signed({ tokenId: 'second' })))).toEqual({
      kind: 'denied',
      reason: 'policy_rate_limited',
    });
  });
  await withStore(
    async ({ admission }) => {
      expect(await admission.claim(claims.runtimeClaim(signed()))).toEqual({ kind: 'claimed' });
      expect(
        await admission.claim(
          claims.runtimeClaim(signed({ tokenId: 'second', service: 'worker' })),
        ),
      ).toEqual({ kind: 'denied', reason: 'admission_capacity' });
    },
    { maxTrackedActions: 1 },
  );
});

test('old completed rows do not consume capacity after their window', async () => {
  await withStore(
    async ({ admission, setNow }) => {
      expect(await admission.claim(claims.runtimeClaim(signed()))).toEqual({ kind: 'claimed' });
      const completion: claims.RuntimeCompletion = {
        tokenId: 'tok-1',
        actionId: 'act-1',
        requestHash: claims.requestHash(signed()),
        result: { status: 'executed', reason: 'executed' },
      };
      expect(await admission.complete(completion)).toEqual({ kind: 'completed' });
      setNow(T0 + 15 * 60_000);
      expect(
        await admission.claim(
          claims.runtimeClaim(signed({ tokenId: 'new', issuedOffset: 15 * 60_000 })),
        ),
      ).toEqual({ kind: 'claimed' });
    },
    { maxTrackedActions: 1 },
  );
});

test('a denied claim emits no admitted audit and a late recheck denies the effect', async () => {
  await withStore(async ({ admission, audits, setNow }) => {
    expect(await admission.claim(claims.runtimeClaim(signed({ confidence: 0.1 })))).toMatchObject({
      kind: 'denied',
      reason: 'policy_low_confidence',
    });
    expect(audits.some((draft) => draft.type === 'actuator.admitted')).toBe(false);

    expect(await admission.claim(claims.runtimeClaim(signed()))).toEqual({ kind: 'claimed' });
    expect(audits.filter((draft) => draft.type === 'actuator.admitted')).toHaveLength(1);
    setNow(T0 + 15 * 60_000);
    expect(await admission.recheck?.(claims.runtimeClaim(signed()))).toBe('expired');
  });
});

test('completion replay keeps one terminal outcome and one completion audit', async () => {
  await withStore(async ({ admission, audits }) => {
    const request = signed();
    const completion: claims.RuntimeCompletion = {
      tokenId: request.approval.tokenId,
      actionId: request.action.id,
      requestHash: claims.requestHash(request),
      result: { status: 'executed', reason: 'executed' },
    };
    expect(await admission.claim(claims.runtimeClaim(request))).toEqual({ kind: 'claimed' });
    expect(await admission.complete(completion)).toEqual({ kind: 'completed' });
    expect(await admission.complete(completion)).toEqual({
      kind: 'known',
      result: { status: 'executed', reason: 'executed' },
    });
    expect(audits.filter((draft) => draft.type === 'actuator.executed')).toHaveLength(1);
  });
});
