import { Injectable } from '@nestjs/common';

import { PrismaService } from '../infra/prisma.service';
import type { EnvironmentRecord } from '../deploys/deploy.types';

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
  async findOrCreate(orgId: string, name: string): Promise<EnvironmentRecord> {
    const row = await this.db.environment.upsert({
      where: { orgId_name: { orgId, name } },
      create: { orgId, name },
      update: {},
    });
    return toRecord(row);
  }

  async list(orgId: string): Promise<EnvironmentRecord[]> {
    const rows = await this.db.environment.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toRecord);
  }
}
