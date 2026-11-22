import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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
  constructor(private readonly db: PrismaService) {}

  /** The unique (org, name) key makes concurrent first use safe. */
  async findOrCreate(
    orgId: string,
    name: string,
  ): Promise<{ record: EnvironmentRecord; created: boolean }> {
    const existing = await this.db.environment.findUnique({
      where: { orgId_name: { orgId, name } },
    });
    if (existing !== null) return { record: toRecord(existing), created: false };
    try {
      const row = await this.db.environment.create({ data: { orgId, name } });
      return { record: toRecord(row), created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('The Environment name is already used in this Organization');
      }
      throw error;
    }
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
