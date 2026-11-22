import { ConflictException, Injectable } from '@nestjs/common';
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
   * Creates the Environment and its audit entries in one transaction. A caller
   * that loses the unique (org, name) race gets a 409 and writes no audit entry.
   */
  async createWithAudit(input: {
    orgId: string;
    name: string;
    projectIds: string[];
    actor: string;
  }): Promise<{ record: EnvironmentRecord; created: boolean }> {
    return inAuditTransaction(this.db, async (tx) => {
      const existing = await tx.environment.findUnique({
        where: { orgId_name: { orgId: input.orgId, name: input.name } },
      });
      if (existing !== null) return { record: toRecord(existing), created: false };
      let row: EnvironmentRow;
      try {
        row = await tx.environment.create({
          data: { orgId: input.orgId, name: input.name },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('The Environment name is already used in this Organization');
        }
        throw error;
      }
      await Promise.all(
        input.projectIds.map(async (projectId) =>
          this.audit.appendInTransaction(tx, projectId, {
            actor: input.actor,
            type: 'environment.created',
            payload: { environmentId: row.id, orgId: input.orgId, projectId },
          }),
        ),
      );
      return { record: toRecord(row), created: true };
    });
  }

  async list(orgId: string, projectId?: string): Promise<EnvironmentRecord[]> {
    const rows = await this.db.environment.findMany({
      where: {
        orgId,
        ...(projectId === undefined
          ? {}
          : { deploys: { some: { projectLinks: { some: { projectId } } } } }),
      },
      orderBy: { name: 'asc' },
    });
    return rows.map(toRecord);
  }
}
