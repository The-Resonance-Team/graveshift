import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { AuditRepo } from '../../src/audit/audit.repo';
import { verifyEntries } from '../../src/audit/chain';
import type { PrismaService } from '../../src/infra/prisma.service';
import { dbTestEnabled, openTestDatabase, resetDatabase } from './fixtures';

const draft = { key: 'producer:1', actor: 'fixture', type: 'test.event', payload: { n: 1 } };
let db: PrismaService;
let audit: AuditRepo;

describe.skipIf(!dbTestEnabled)('Postgres audit integrity', () => {
  beforeAll(async () => {
    db = await openTestDatabase();
    audit = new AuditRepo(db);
  });
  beforeEach(async () => resetDatabase(db));
  afterAll(async () => db.onModuleDestroy());

  test('raw UPDATE and DELETE are rejected by the migrated Postgres triggers', async () => {
    await audit.append('project-1', draft);
    await expect(
      Promise.resolve(db.$executeRaw`UPDATE audit_entries SET actor = 'forged'`),
    ).rejects.toThrow('append-only');
    await expect(Promise.resolve(db.$executeRaw`DELETE FROM audit_entries`)).rejects.toThrow(
      'append-only',
    );
    expect(await audit.verifyChain('project-1')).toEqual({ ok: true, length: 1 });
  });

  test.each([
    { actor: 'forged' },
    { type: 'forged' },
    { payload: { n: 99 } },
    { at: new Date('2000-01-01T00:00:00.000Z') },
    { incidentId: 'forged' },
    { hash: 'f'.repeat(64) },
  ])('verification detects bypassed field tampering: %j', async (data) => {
    await audit.append('project-1', draft);
    await audit.append('project-1', { ...draft, key: 'producer:2' });
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.auditEntry.update({
        where: { projectId_seq: { projectId: 'project-1', seq: 1 } },
        data,
      });
    });
    expect(await audit.verifyChain('project-1')).toEqual({
      ok: false,
      brokenAtSeq: 1,
      reason: 'hash mismatch',
    });
  });

  test('verification detects a bypassed previous-hash edit', async () => {
    await audit.append('project-1', draft);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.auditEntry.update({
        where: { projectId_seq: { projectId: 'project-1', seq: 1 } },
        data: { prevHash: 'f'.repeat(64) },
      });
    });
    expect(await audit.verifyChain('project-1')).toEqual({
      ok: false,
      brokenAtSeq: 1,
      reason: 'prevHash mismatch',
    });
  });

  test('verification detects a bypassed sequence edit', async () => {
    await audit.append('project-1', draft);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.auditEntry.update({
        where: { projectId_seq: { projectId: 'project-1', seq: 1 } },
        data: { seq: 2 },
      });
    });
    expect(await audit.verifyChain('project-1')).toEqual({
      ok: false,
      brokenAtSeq: 1,
      reason: 'sequence gap or reorder',
    });
  });

  test('verification detects removal of an interior row', async () => {
    await [1, 2, 3].reduce(
      (prior, n) =>
        prior
          .then(() => audit.append('project-1', { ...draft, key: `entry:${n}` }))
          .then(() => undefined),
      Promise.resolve(),
    );
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.auditEntry.delete({ where: { projectId_seq: { projectId: 'project-1', seq: 2 } } });
    });
    expect(await audit.verifyChain('project-1')).toEqual({
      ok: false,
      brokenAtSeq: 2,
      reason: 'sequence gap or reorder',
    });
  });

  test('a __proto__ payload survives JSONB and duplicate delivery with a valid hash', async () => {
    const input = {
      ...draft,
      payload: JSON.parse(
        '{"__proto__":{"polluted":true},"nested":{"__proto__":{"n":1},"z":3},"n":2}',
      ),
    };
    const original = await audit.append('project-1', input);
    expect(await audit.append('project-1', input)).toEqual(original);
    const rows = await audit.list('project-1');
    expect(rows).toEqual([original]);
    expect(verifyEntries(rows)).toEqual({ ok: true, length: 1 });
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });
});
