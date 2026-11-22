import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { AuditRepo } from '../../src/audit/audit.repo';
import { inAuditTransaction } from '../../src/audit/audit.transaction';
import type { PrismaService } from '../../src/infra/prisma.service';
import {
  FIXTURE_AT,
  dbTestEnabled,
  openTestDatabase,
  resetDatabase,
  workItemData,
} from './fixtures';

let db: PrismaService;

describe.skipIf(!dbTestEnabled)('Postgres FixAttempt schema foundation', () => {
  beforeAll(async () => {
    db = await openTestDatabase();
  });
  beforeEach(async () => {
    await resetDatabase(db);
    await db.workItem.create({ data: workItemData() });
  });
  afterAll(async () => db.onModuleDestroy());

  test('persists private progress, params, question, result, publication, and versions', async () => {
    const created = await db.fixAttempt.create({
      data: {
        id: 'attempt-1',
        projectId: 'project-1',
        commandId: 'command-1',
        workItemId: 'work-1',
        agent: 'fixture',
        trigger: 'fix_now',
        state: 'awaiting_answer',
        routingProgress: { next: 'question-1' },
        params: { service: 'fixture' },
        questionId: 'question-1',
        result: { known: true },
        publication: { branch: 'fixture' },
        baseSha: 'fixture-base',
        createdAt: new Date(FIXTURE_AT),
      },
    });
    expect(created.version).toBe(0);
    expect(created.createdAt.toISOString()).toBe('2026-11-21T00:00:00.000Z');
    const updated = await db.fixAttempt.update({
      where: { id: 'attempt-1' },
      data: { state: 'uncertain', version: { increment: 1 } },
    });
    const fresh = await openTestDatabase();
    try {
      expect(await fresh.fixAttempt.findUnique({ where: { id: 'attempt-1' } })).toEqual(updated);
      expect(updated.version).toBe(1);
      expect(updated.routingProgress).toEqual({ next: 'question-1' });
      expect(updated.questionId).toBe('question-1');
    } finally {
      await fresh.onModuleDestroy();
    }
  });

  test('the Work item relation refuses a FixAttempt in another project', async () => {
    await expect(
      db.fixAttempt.create({
        data: {
          id: 'foreign-attempt',
          projectId: 'project-2',
          commandId: 'command-1',
          workItemId: 'work-1',
          agent: 'fixture',
          trigger: 'auto_fix',
          state: 'claimed',
          params: {},
        },
      }),
    ).rejects.toHaveProperty('code', 'P2003');
    expect(await db.fixAttempt.count()).toBe(0);
  });

  test('a version predicate admits one active claim and its audit row under contention', async () => {
    const audit = new AuditRepo(db);
    const claim = (id: string) =>
      inAuditTransaction(db, async (tx) => {
        const changed = await tx.workItem.updateMany({
          where: { projectId: 'project-1', id: 'work-1', version: 0, activeAttemptId: null },
          data: { activeAttemptId: id, version: { increment: 1 } },
        });
        if (changed.count === 0) return false;
        await tx.fixAttempt.create({
          data: {
            id,
            projectId: 'project-1',
            commandId: `command:${id}`,
            workItemId: 'work-1',
            agent: 'fixture',
            trigger: 'fix_now',
            state: 'claimed',
            params: {},
          },
        });
        await audit.appendInTx(tx, 'project-1', {
          key: `claim:${id}`,
          actor: 'fixture',
          type: 'fix.claimed',
          payload: { attemptId: id },
        });
        return true;
      });
    const results = await Promise.all([claim('attempt-1'), claim('attempt-2')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.fixAttempt.count()).toBe(1);
    const work = await db.workItem.findUniqueOrThrow({ where: { id: 'work-1' } });
    expect(work.version).toBe(1);
    const attempt = await db.fixAttempt.findUniqueOrThrow({ where: { id: work.activeAttemptId! } });
    expect(attempt.workItemId).toBe(work.id);
    const entries = await audit.list('project-1');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.payload.attemptId).toBe(attempt.id);
    expect(await audit.verifyChain('project-1')).toEqual({ ok: true, length: 1 });
  });

  test('one command can create at most one attempt in its project under contention', async () => {
    const create = (id: string) =>
      db.fixAttempt.create({
        data: {
          id,
          projectId: 'project-1',
          commandId: 'same-command',
          workItemId: 'work-1',
          agent: 'fixture',
          trigger: 'fix_now',
          state: 'claimed',
          params: {},
        },
      });
    const results = await Promise.allSettled([create('attempt-1'), create('attempt-2')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.fixAttempt.count({ where: { projectId: 'project-1', commandId: 'same-command' } }),
    ).toBe(1);
    const stored = await db.fixAttempt.findUniqueOrThrow({
      where: { projectId_commandId: { projectId: 'project-1', commandId: 'same-command' } },
    });
    expect(stored.commandId).toBe('same-command');
  });
});
