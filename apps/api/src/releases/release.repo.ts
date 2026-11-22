import { Injectable } from '@nestjs/common';

import { PrismaService } from '../infra/prisma.service';
import type { ReleaseRecord } from '../deploys/deploy.types';

const withProjects = { projectLinks: { select: { projectId: true } } } as const;

type ReleaseRow = {
  id: string;
  orgId: string;
  version: string;
  createdAt: Date;
  projectLinks: Array<{ projectId: string }>;
};

const toRecord = (row: ReleaseRow): ReleaseRecord => ({
  id: row.id,
  orgId: row.orgId,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  projectIds: row.projectLinks.map((link) => link.projectId),
});

/** Owns every write to the Release and ProjectRelease tables. */
@Injectable()
export class ReleaseRepo {
  constructor(private readonly db: PrismaService) {}

  async create(input: {
    orgId: string;
    version: string;
    projectIds: string[];
  }): Promise<ReleaseRecord> {
    const row = await this.db.$transaction(async (tx) => {
      const release = await tx.release.create({
        data: { orgId: input.orgId, version: input.version },
      });
      await tx.projectRelease.createMany({
        data: input.projectIds.map((projectId) => ({ projectId, releaseId: release.id })),
      });
      return tx.release.findUniqueOrThrow({ where: { id: release.id }, include: withProjects });
    });
    return toRecord(row);
  }

  async findByVersion(orgId: string, version: string): Promise<ReleaseRecord | undefined> {
    const row = await this.db.release.findUnique({
      where: { orgId_version: { orgId, version } },
      include: withProjects,
    });
    return row === null ? undefined : toRecord(row);
  }

  async findById(id: string): Promise<ReleaseRecord | undefined> {
    const row = await this.db.release.findUnique({ where: { id }, include: withProjects });
    return row === null ? undefined : toRecord(row);
  }

  async list(orgId: string): Promise<ReleaseRecord[]> {
    const rows = await this.db.release.findMany({
      where: { orgId },
      include: withProjects,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  }
}
