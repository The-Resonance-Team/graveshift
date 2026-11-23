import { Prisma } from '@prisma/client';
import { describe, expect, mock, test } from 'bun:test';

import type { AuditRepo } from '../audit/repo/audit.repo';
import type { PrismaService } from '../infra/prisma.service';
import { EnvironmentRepo } from './environment.repo';

const INPUT = {
  orgId: 'org-1',
  name: 'staging',
  projectId: '1001',
  deploymentId: 'a'.repeat(40),
  actor: 'client-1',
} as const;

const ROW = {
  id: 'env-1',
  orgId: 'org-1',
  name: 'staging',
  createdAt: new Date('2026-11-23T00:00:00.000Z'),
};

const uniqueConflict = () =>
  new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.1',
    meta: { modelName: 'Environment' },
  });

describe('EnvironmentRepo.createWithAudit', () => {
  test('a concurrent first use re-reads the winner and writes no second audit entry', async () => {
    const appendInTransaction = mock(async (_tx: unknown, _projectId: string, _input: unknown) => ({
      seq: 1,
    }));
    const db = {
      $transaction: async (task: (tx: unknown) => Promise<unknown>) =>
        task({
          environment: {
            findUnique: async () => null,
            create: async () => {
              throw uniqueConflict();
            },
          },
        }),
      environment: { findUnique: async () => ROW },
    } as unknown as PrismaService;
    const repo = new EnvironmentRepo(db, { appendInTransaction } as unknown as AuditRepo);

    const result = await repo.createWithAudit(INPUT);

    expect(result).toEqual({
      record: {
        id: ROW.id,
        orgId: ROW.orgId,
        name: ROW.name,
        createdAt: ROW.createdAt.toISOString(),
      },
      created: false,
    });
    expect(appendInTransaction).not.toHaveBeenCalled();
  });

  test('a first create writes one audit entry with the Deployment in its payload', async () => {
    const appendInTransaction = mock(async (_tx: unknown, _projectId: string, _input: unknown) => ({
      seq: 1,
    }));
    const db = {
      $transaction: async (task: (tx: unknown) => Promise<unknown>) =>
        task({
          environment: { findUnique: async () => null, create: async () => ROW },
        }),
    } as unknown as PrismaService;
    const repo = new EnvironmentRepo(db, { appendInTransaction } as unknown as AuditRepo);

    const result = await repo.createWithAudit(INPUT);

    expect(result.created).toBe(true);
    expect(appendInTransaction).toHaveBeenCalledTimes(1);
    expect(appendInTransaction.mock.calls[0]?.[2]).toMatchObject({
      type: 'environment.created',
      payload: { deploymentId: INPUT.deploymentId, projectId: INPUT.projectId },
    });
  });
});
