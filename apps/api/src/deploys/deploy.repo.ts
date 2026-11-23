import { Injectable } from '@nestjs/common';

import { inAuditTransaction } from '../audit/audit.transaction';
import { AuditRepo } from '../audit/repo/audit.repo';
import { PrismaService } from '../infra/prisma.service';
import { AppendOnlyDeployError, type DeployRecord } from './deploy.types';

const DEPLOY_INCLUDE = { environment: { select: { name: true } } } as const;

type DeployRow = {
  orgId: string;
  projectId: string;
  environmentId: string;
  deploymentId: string;
  title: string;
  dateStarted: Date;
  dateFinished: Date | null;
  url: string | null;
  closedAt: Date | null;
  createdAt: Date;
  environment: { name: string };
};

const toRecord = (row: DeployRow): DeployRecord => ({
  orgId: row.orgId,
  projectId: row.projectId,
  deploymentId: row.deploymentId,
  environment: row.environment.name,
  title: row.title,
  dateStarted: row.dateStarted.toISOString(),
  dateFinished: row.dateFinished?.toISOString() ?? null,
  url: row.url,
  closedAt: row.closedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export interface DeployListFilter {
  deploymentId?: string | undefined;
  environment?: string | undefined;
}

/** Owns Deployment rows. No update or delete path exists except one closure transition. */
@Injectable()
export class DeployRepo {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditRepo,
  ) {}

  /** Idempotency and event binding share one lookup: Project, SHA and Environment name. */
  async findByDeployment(
    projectId: string,
    deploymentId: string,
    environment: string,
  ): Promise<DeployRecord | undefined> {
    const row = await this.db.deploy.findFirst({
      where: { projectId, deploymentId, environment: { name: environment } },
      include: DEPLOY_INCLUDE,
    });
    return row === null ? undefined : toRecord(row);
  }

  async append(input: {
    orgId: string;
    projectId: string;
    environmentId: string;
    environment: string;
    deploymentId: string;
    title: string;
    dateStarted: Date;
    dateFinished?: Date | undefined;
    url?: string | undefined;
    actor: string;
  }): Promise<DeployRecord> {
    return inAuditTransaction(this.db, async (tx) => {
      const row = await tx.deploy.create({
        data: {
          orgId: input.orgId,
          projectId: input.projectId,
          environmentId: input.environmentId,
          deploymentId: input.deploymentId,
          title: input.title,
          dateStarted: input.dateStarted,
          dateFinished: input.dateFinished ?? null,
          url: input.url ?? null,
        },
        include: DEPLOY_INCLUDE,
      });
      await this.audit.appendInTransaction(tx, input.projectId, {
        actor: input.actor,
        type: 'deploy.created',
        payload: {
          deploymentId: input.deploymentId,
          projectId: input.projectId,
          orgId: input.orgId,
          title: input.title,
          environment: input.environment,
        },
      });
      return toRecord(row);
    });
  }

  async list(
    orgId: string,
    projectId?: string,
    filter: DeployListFilter = {},
  ): Promise<DeployRecord[]> {
    const rows = await this.db.deploy.findMany({
      where: {
        orgId,
        ...(projectId === undefined ? {} : { projectId }),
        ...(filter.deploymentId === undefined ? {} : { deploymentId: filter.deploymentId }),
        ...(filter.environment === undefined ? {} : { environment: { name: filter.environment } }),
      },
      include: DEPLOY_INCLUDE,
      orderBy: [{ dateStarted: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toRecord);
  }

  /** Closes the first Deployment for this SHA in one Environment. Later events write no entry. */
  async closeFirst(projectId: string, deploymentId: string, environment: string): Promise<boolean> {
    return inAuditTransaction(this.db, async (tx) => {
      const closed = await tx.deploy.updateMany({
        where: { projectId, deploymentId, closedAt: null, environment: { name: environment } },
        data: { closedAt: new Date() },
      });
      if (closed.count === 0) return false;
      await this.audit.appendInTransaction(tx, projectId, {
        actor: 'daemon',
        type: 'deployment.closed',
        payload: { deploymentId, projectId, environment },
      });
      return true;
    });
  }

  /** The poll uses this set to stop serving events for a closed Deployment. */
  async listClosedIds(projectId: string): Promise<string[]> {
    const rows = await this.db.deploy.findMany({
      where: { projectId, closedAt: { not: null } },
      select: { deploymentId: true },
    });
    return rows.map((row) => row.deploymentId);
  }

  /** Repository rule: a Deployment cannot be changed except by closeFirst above. */
  update(): never {
    throw new AppendOnlyDeployError();
  }

  /** Repository rule: a Deployment can never be removed. */
  delete(): never {
    throw new AppendOnlyDeployError();
  }
}
