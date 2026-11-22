import { Injectable } from '@nestjs/common';

import { PrismaService } from '../infra/prisma.service';
import { AppendOnlyDeployError, type DeployRecord } from './deploy.types';

const withProjects = { projectLinks: { select: { projectId: true } } } as const;
const withEnvironment = { environment: { select: { name: true } } } as const;

type DeployRow = {
  id: string;
  orgId: string;
  releaseId: string;
  environmentId: string;
  name: string;
  dateStarted: Date;
  dateFinished: Date | null;
  url: string | null;
  createdAt: Date;
  environment: { name: string };
  projectLinks: Array<{ projectId: string }>;
};

const toRecord = (row: DeployRow): DeployRecord => ({
  id: row.id,
  orgId: row.orgId,
  releaseId: row.releaseId,
  environmentId: row.environmentId,
  environment: row.environment.name,
  name: row.name,
  dateStarted: row.dateStarted.toISOString(),
  dateFinished: row.dateFinished?.toISOString() ?? null,
  url: row.url,
  createdAt: row.createdAt.toISOString(),
  projectIds: row.projectLinks.map((link) => link.projectId),
});

/** Owns Deploy inserts and its Project links. No update or delete path exists. */
@Injectable()
export class DeployRepo {
  constructor(private readonly db: PrismaService) {}

  async append(input: {
    orgId: string;
    releaseId: string;
    environmentId: string;
    name: string;
    dateStarted: Date;
    dateFinished?: Date | undefined;
    url?: string | undefined;
    projectIds: string[];
  }): Promise<DeployRecord> {
    const row = await this.db.$transaction(async (tx) => {
      const deploy = await tx.deploy.create({
        data: {
          orgId: input.orgId,
          releaseId: input.releaseId,
          environmentId: input.environmentId,
          name: input.name,
          dateStarted: input.dateStarted,
          dateFinished: input.dateFinished ?? null,
          url: input.url ?? null,
        },
      });
      await tx.deployProject.createMany({
        data: input.projectIds.map((projectId) => ({ deployId: deploy.id, projectId })),
      });
      return tx.deploy.findUniqueOrThrow({
        where: { id: deploy.id },
        include: { ...withProjects, ...withEnvironment },
      });
    });
    return toRecord(row);
  }

  async list(orgId: string, releaseId?: string): Promise<DeployRecord[]> {
    const rows = await this.db.deploy.findMany({
      where: { orgId, ...(releaseId === undefined ? {} : { releaseId }) },
      include: { ...withProjects, ...withEnvironment },
      orderBy: { dateStarted: 'asc' },
    });
    return rows.map(toRecord);
  }

  /** Repository rule: a Deploy can be written once and never changed. */
  update(): never {
    throw new AppendOnlyDeployError();
  }

  /** Repository rule: a Deploy can be written once and never removed. */
  delete(): never {
    throw new AppendOnlyDeployError();
  }
}
