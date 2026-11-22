import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { AuditRepo } from '../../src/audit/audit.repo';
import { GENESIS_HASH } from '../../src/audit/chain';
import type { PrismaService } from '../../src/infra/prisma.service';
import { dbTestEnabled, modelCounts, openTestDatabase, resetDatabase } from './fixtures';

const draft = { key: 'producer:1', actor: 'fixture', type: 'test.event', payload: { n: 1 } };
let db: PrismaService;
let audit: AuditRepo;

describe.skipIf(!dbTestEnabled)('Postgres audit append', () => {
  beforeAll(async () => {
    db = await openTestDatabase();
    audit = new AuditRepo(db);
  });
  beforeEach(async () => resetDatabase(db));
  afterAll(async () => db.onModuleDestroy());

  test('starts each project chain at genesis and keeps private fields off the public entry', async () => {
    const first = await audit.append('project-1', draft);
    const other = await audit.append('project-2', draft);
    expect(first.seq).toBe(1);
    expect(other.seq).toBe(1);
    expect(first.prevHash).toBe(GENESIS_HASH);
    expect(Object.keys(first).sort()).toEqual([
      'actor',
      'at',
      'hash',
      'payload',
      'prevHash',
      'seq',
      'type',
    ]);
    expect(await audit.verifyChain('project-1')).toEqual({ ok: true, length: 1 });
    expect(await audit.verifyChain('absent')).toEqual({ ok: true, length: 0 });
  });

  test('serializes concurrent writers across two clients without sequence gaps', async () => {
    const second = await openTestDatabase();
    try {
      const other = new AuditRepo(second);
      const results = await Promise.all(
        Array.from({ length: 16 }, (_, index) =>
          (index % 2 ? audit : other).append('project-1', {
            ...draft,
            key: `concurrent:${index}`,
            payload: { index },
          }),
        ),
      );
      expect(results.map((entry) => entry.seq).sort((left, right) => left - right)).toEqual(
        Array.from({ length: 16 }, (_, index) => index + 1),
      );
      expect(await other.verifyChain('project-1')).toEqual({ ok: true, length: 16 });
      expect(await modelCounts(db)).toMatchObject({ auditEntry: 16, credential: 0, workItem: 0 });
    } finally {
      await second.onModuleDestroy();
    }
  }, 15_000);

  test('concurrent retries of one producer key produce exactly one entry', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => audit.append('project-1', draft)),
    );
    expect(results.every((entry) => entry.hash === results[0]?.hash && entry.seq === 1)).toBe(true);
    expect(await db.auditEntry.count()).toBe(1);
  }, 15_000);

  test('a repeated key with reordered facts returns the original timestamp and hash', async () => {
    const first = await audit.append('project-1', {
      ...draft,
      payload: { z: 2, a: { y: 1, b: 3 } },
    });
    const repeated = await audit.append('project-1', {
      ...draft,
      payload: { a: { b: 3, y: 1 }, z: 2 },
    });
    expect(repeated).toEqual(first);
    expect(await db.auditEntry.count()).toBe(1);
  });

  test.each([
    { actor: 'different' },
    { type: 'other.event' },
    { incidentId: 'incident-2' },
    { payload: { n: 2 } },
  ])('the same key with different facts conflicts: %j', async (change) => {
    await audit.append('project-1', draft);
    await expect(audit.append('project-1', { ...draft, ...change })).rejects.toHaveProperty(
      'code',
      'AUDIT_KEY_CONFLICT',
    );
    expect(await audit.verifyChain('project-1')).toEqual({ ok: true, length: 1 });
  });

  test('acknowledged data is visible to another client and survives a client restart', async () => {
    const entry = await audit.append('project-1', { ...draft, incidentId: 'incident-1' });
    const observer = await openTestDatabase();
    try {
      expect(await new AuditRepo(observer).list('project-1')).toEqual([entry]);
    } finally {
      await observer.onModuleDestroy();
    }
    await db.onModuleDestroy();
    db = await openTestDatabase();
    audit = new AuditRepo(db);
    expect(await audit.append('project-1', { ...draft, incidentId: 'incident-1' })).toEqual(entry);
    expect(await audit.verifyChain('project-1')).toEqual({ ok: true, length: 1 });
  });

  test('pagination is ordered and project-scoped', async () => {
    await audit.append('project-2', draft);
    await [1, 2, 3].reduce(
      (prior, n) =>
        prior
          .then(() => audit.append('project-1', { ...draft, key: `page:${n}` }))
          .then(() => undefined),
      Promise.resolve(),
    );
    expect(
      (await audit.list('project-1', { afterSeq: 1, limit: 1 })).map((entry) => entry.seq),
    ).toEqual([2]);
    expect(await audit.list('absent')).toEqual([]);
  });

  test('reset and row counts use the same owned model registry', async () => {
    await audit.append('project-1', draft);
    await resetDatabase(db);
    const counts = await modelCounts(db);
    await resetDatabase(db);
    expect(await modelCounts(db)).toEqual(counts);
    expect(Object.values(counts).every((count) => count === 0)).toBe(true);
  });
});
