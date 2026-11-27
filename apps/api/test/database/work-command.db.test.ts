import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { DiagnosisSchema } from '@graveshift/core';

import { AuditRepo } from '../../src/audit/audit.repo';
import { inAuditTransaction } from '../../src/audit/audit.transaction';
import type { PrismaService } from '../../src/infra/prisma.service';
import {
  FIXTURE_AT,
  dbTestEnabled,
  modelCounts,
  openTestDatabase,
  resetDatabase,
  workItemData,
} from './fixtures';

const command = {
  projectId: 'project-1',
  commandId: 'command-1',
  workItemId: 'work-1',
  actor: 'fixture',
  kind: 'triage',
  requestHash: 'fixture-request-hash',
  result: { accepted: true },
};
let db: PrismaService;

describe.skipIf(!dbTestEnabled)('Postgres WorkCommand foundation', () => {
  beforeAll(async () => {
    db = await openTestDatabase();
  });
  beforeEach(async () => {
    await resetDatabase(db);
    await db.workItem.create({ data: workItemData() });
  });
  afterAll(async () => db.onModuleDestroy());

  test('stored user intent and result survive a client restart', async () => {
    const original = await db.workCommand.create({ data: { ...command, workVersion: 7 } });
    await db.onModuleDestroy();
    db = await openTestDatabase();
    expect(
      await db.workCommand.findUnique({
        where: {
          projectId_commandId: { projectId: command.projectId, commandId: command.commandId },
        },
      }),
    ).toEqual(original);
    expect(original.requestHash).toBe(command.requestHash);
    expect(original.result).toEqual(command.result);
    expect(original.workVersion).toBe(7);
  });

  test('a concurrent command id is admitted once within its project', async () => {
    const results = await Promise.allSettled([
      db.workCommand.create({ data: command }),
      db.workCommand.create({ data: { ...command, requestHash: 'different-request' } }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.workCommand.count()).toBe(1);
  });

  test('the command id is project-scoped and the Work item foreign key is project-safe', async () => {
    await db.workCommand.create({ data: command });
    await expect(
      Promise.resolve(db.workCommand.create({ data: { ...command, projectId: 'project-2' } })),
    ).rejects.toHaveProperty('code', 'P2003');
    await db.workItem.create({ data: workItemData('project-2', 'work-2') });
    const other = await db.workCommand.create({
      data: {
        ...command,
        projectId: 'project-2',
        workItemId: 'work-2',
        requestHash: 'other-project',
      },
    });
    expect(other.commandId).toBe(command.commandId);
    expect(await db.workCommand.count()).toBe(2);
  });

  test('command admission, Work item change, and audit commit or roll back together', async () => {
    const audit = new AuditRepo(db);
    const failure = new Error('abort command');
    await expect(
      inAuditTransaction(db, async (tx) => {
        await tx.workCommand.create({ data: command });
        await tx.workItem.update({
          where: { id: command.workItemId },
          data: { version: { increment: 1 } },
        });
        await audit.appendInTx(tx, command.projectId, {
          key: `work-command:${command.commandId}`,
          actor: command.actor,
          type: 'work.triaged',
          payload: {},
        });
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await modelCounts(db)).toMatchObject({ workCommand: 0, auditEntry: 0, workItem: 1 });
    expect(
      (await db.workItem.findUniqueOrThrow({ where: { id: command.workItemId } })).version,
    ).toBe(0);
  });

  test('the admitted Work item can retain its Diagnosis for durable fix context', async () => {
    const diagnosis = DiagnosisSchema.parse({
      id: 'diagnosis-1',
      incidentId: 'haunting-1',
      rootCause: 'Fixture condition',
      evidence: [{ ref: 'signal-1', excerpt: 'Fixture evidence' }],
      confidence: 0.9,
      createdAt: new Date(FIXTURE_AT).toISOString(),
    });
    await db.workItem.update({ where: { id: command.workItemId }, data: { diagnosis } });
    const fresh = await openTestDatabase();
    try {
      const work = await fresh.workItem.findUniqueOrThrow({ where: { id: command.workItemId } });
      expect(DiagnosisSchema.parse(work.diagnosis)).toEqual(diagnosis);
    } finally {
      await fresh.onModuleDestroy();
    }
  });
});
