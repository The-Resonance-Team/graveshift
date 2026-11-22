import { Injectable } from '@nestjs/common';

import { AuditRepo } from '../audit/repo/audit.repo';
import { inAuditTransaction } from '../audit/audit.transaction';
import type { ReleaseRecord } from '../deploys/deploy.types';
import { PrismaService } from '../infra/prisma.service';

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
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditRepo,
  ) {}

  async create(input: {
    orgId: string;
    version: string;
    projectIds: string[];
    actor: string;
  }): Promise<ReleaseRecord> {
    return inAuditTransaction(this.db, async (tx) => {
      const release = await tx.release.create({
        data: { orgId: input.orgId, version: input.version },
      });
      await tx.projectRelease.createMany({
        data: input.projectIds.map((projectId) => ({ projectId, releaseId: release.id })),
      });
      const row = await tx.release.findUniqueOrThrow({
        where: { id: release.id },
        include: withProjects,
      });
      await Promise.all(
        input.projectIds.map(async (projectId) =>
          this.audit.appendInTransaction(tx, projectId, {
            actor: input.actor,
            type: 'release.created',
            payload: {
              releaseId: release.id,
              version: release.version,
              orgId: release.orgId,
              projectId,
            },
          }),
        ),
      );
      return toRecord(row);
    });
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

  async list(orgId: string, projectId?: string): Promise<ReleaseRecord[]> {
    const rows = await this.db.release.findMany({
      where: {
        orgId,
        ...(projectId === undefined ? {} : { projectLinks: { some: { projectId } } }),
      },
      include: withProjects,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  }
}
