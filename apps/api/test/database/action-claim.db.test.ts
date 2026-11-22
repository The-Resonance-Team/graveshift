import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { AuditRepo } from '../../src/audit/audit.repo';
import { inAuditTransaction } from '../../src/audit/audit.transaction';
import type { PrismaService } from '../../src/infra/prisma.service';
import { dbTestEnabled, modelCounts, openTestDatabase, resetDatabase } from './fixtures';

let db: PrismaService;

async function claimData() {
  const clock = await db.$queryRaw<{ expiresAt: Date }[]>`
    SELECT (statement_timestamp() AT TIME ZONE 'UTC') + INTERVAL '15 minutes' AS "expiresAt"
  `;
  if (!clock[0]) throw new Error('The database did not return a fixture expiry.');
  return {
    projectId: 'project-1',
    tokenId: 'token-1',
    actionId: 'action-1',
    requestHash: 'fixture-request-hash',
    service: 'fixture',
    incidentId: 'haunting-1',
    state: 'admitted',
    expiresAt: clock[0].expiresAt,
  };
}

describe.skipIf(!dbTestEnabled)('Postgres durable ActionClaim foundation', () => {
  beforeAll(async () => {
    db = await openTestDatabase();
  });
  beforeEach(async () => resetDatabase(db));
  afterAll(async () => db.onModuleDestroy());

  test('admission and completion survive client restarts', async () => {
    const original = await db.actionClaim.create({ data: await claimData() });
    expect(original.state).toBe('admitted');
    expect(original.admittedAt).toBeInstanceOf(Date);
    expect(original.expiresAt.getTime()).toBeGreaterThan(original.admittedAt.getTime());
    expect(original.completedAt).toBeNull();
    expect(original.result).toBeNull();
    await db.onModuleDestroy();
    db = await openTestDatabase();
    const where = {
      projectId_tokenId: { projectId: original.projectId, tokenId: original.tokenId },
    };
    expect(await db.actionClaim.findUnique({ where })).toEqual(original);
    const completed = await db.actionClaim.update({
      where,
      data: {
        state: 'completed',
        completedAt: original.admittedAt,
        result: { status: 'executed' },
      },
    });
    await db.onModuleDestroy();
    db = await openTestDatabase();
    const restored = await db.actionClaim.findUniqueOrThrow({ where });
    expect(restored).toEqual(completed);
    expect(restored.state).toBe('completed');
  });

  test('concurrent admission of one token produces exactly one durable claim', async () => {
    const data = await claimData();
    const results = await Promise.allSettled([
      db.actionClaim.create({ data }),
      db.actionClaim.create({ data: { ...data, actionId: 'action-2' } }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' ? rejected.reason.code : undefined).toBe('P2002');
    expect(await db.actionClaim.count()).toBe(1);
  });

  test('a new token cannot readmit the same action in one project', async () => {
    const data = await claimData();
    await db.actionClaim.create({ data });
    await expect(
      db.actionClaim.create({ data: { ...data, tokenId: 'token-2' } }),
    ).rejects.toHaveProperty('code', 'P2002');
    expect(
      await db.actionClaim.findUnique({
        where: { projectId_actionId: { projectId: data.projectId, actionId: data.actionId } },
      }),
    ).toMatchObject({ tokenId: data.tokenId });
  });

  test('token and action uniqueness are project-scoped', async () => {
    const data = await claimData();
    await db.actionClaim.create({ data });
    await db.actionClaim.create({ data: { ...data, projectId: 'project-2', service: 'other' } });
    const rows = await db.actionClaim.findMany({
      where: { projectId: 'project-1', service: 'fixture' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.projectId).toBe('project-1');
    expect(await db.actionClaim.count()).toBe(2);
  });

  test('the claim and its admission audit entry commit together', async () => {
    const data = await claimData();
    const audit = new AuditRepo(db);
    await inAuditTransaction(db, async (tx) => {
      await tx.actionClaim.create({ data });
      await audit.appendInTx(tx, data.projectId, {
        key: `actuator:${data.tokenId}:admission`,
        actor: 'actuator',
        type: 'actuator.admitted',
        incidentId: data.incidentId,
        payload: { actionId: data.actionId, service: data.service },
      });
    });
    expect(await modelCounts(db)).toMatchObject({ actionClaim: 1, auditEntry: 1 });
    expect(await audit.verifyChain(data.projectId)).toEqual({ ok: true, length: 1 });
  });

  test('a failed audit rolls back a staged claim before any privileged effect', async () => {
    const data = await claimData();
    const audit = new AuditRepo(db);
    const draft = { key: 'admission-1', actor: 'actuator', type: 'actuator.admitted', payload: {} };
    await audit.append(data.projectId, draft);
    await expect(
      inAuditTransaction(db, async (tx) => {
        await tx.actionClaim.create({ data });
        await audit.appendInTx(tx, data.projectId, { ...draft, payload: { different: true } });
      }),
    ).rejects.toHaveProperty('code', 'AUDIT_KEY_CONFLICT');
    expect(await modelCounts(db)).toMatchObject({ actionClaim: 0, auditEntry: 1 });
  });

  test('the owned model registry resets and counts ActionClaim', async () => {
    await db.actionClaim.create({ data: await claimData() });
    expect(await modelCounts(db)).toMatchObject({ actionClaim: 1 });
    await resetDatabase(db);
    const first = await modelCounts(db);
    expect(first.actionClaim).toBe(0);
    expect(Object.values(first).every((count) => count === 0)).toBe(true);
    await resetDatabase(db);
    expect(await modelCounts(db)).toEqual(first);
  });
});
