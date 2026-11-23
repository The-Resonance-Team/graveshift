import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditRepo } from '../audit/repo/audit.repo';
import { inAuditTransaction } from '../audit/audit.transaction';
import type { EnvironmentRecord } from '../deploys/deploy.types';
import { PrismaService } from '../infra/prisma.service';

type EnvironmentRow = { id: string; orgId: string; name: string; createdAt: Date };

const toRecord = (row: EnvironmentRow): EnvironmentRecord => ({
  id: row.id,
  orgId: row.orgId,
  name: row.name,
  createdAt: row.createdAt.toISOString(),
});

/** Owns the Organization-scoped Environment name registry. */
@Injectable()
export class EnvironmentRepo {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditRepo,
  ) {}

  /**
   * Creates the Environment and its audit entry in one transaction. A caller that
   * loses the unique (org, name) race re-reads the committed row and returns it as
   * a reuse; it writes no second audit entry and reports no conflict.
   */
  async createWithAudit(input: {
    orgId: string;
    name: string;
    projectId: string;
    deploymentId: string;
    actor: string;
  }): Promise<{ record: EnvironmentRecord; created: boolean }> {
    try {
      return await inAuditTransaction(this.db, async (tx) => {
        const existing = await tx.environment.findUnique({
          where: { orgId_name: { orgId: input.orgId, name: input.name } },
        });
        if (existing !== null) return { record: toRecord(existing), created: false };
        const row = await tx.environment.create({
          data: { orgId: input.orgId, name: input.name },
        });
        await this.audit.appendInTransaction(tx, input.projectId, {
          actor: input.actor,
          type: 'environment.created',
          payload: {
            environmentId: row.id,
            orgId: input.orgId,
            projectId: input.projectId,
            deploymentId: input.deploymentId,
          },
        });
        return { record: toRecord(row), created: true };
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      // A concurrent insert committed the row. The failed transaction is aborted,
      // so read outside it and report reuse with no new audit entry.
      const winner = await this.db.environment.findUnique({
        where: { orgId_name: { orgId: input.orgId, name: input.name } },
      });
      if (winner === null) throw error;
      return { record: toRecord(winner), created: false };
    }
  }

  async list(orgId: string, projectId?: string): Promise<EnvironmentRecord[]> {
    const rows = await this.db.environment.findMany({
      where: {
        orgId,
        ...(projectId === undefined ? {} : { deploys: { some: { projectId } } }),
      },
      orderBy: { name: 'asc' },
    });
    return rows.map(toRecord);
  }
}
