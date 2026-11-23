import { Injectable } from '@nestjs/common';
import { redact } from '@graveshift/redactor';

import { inAuditTransaction } from '../audit/audit.transaction';
import { AuditRepo } from '../audit/repo/audit.repo';
import { PrismaService } from '../infra/prisma.service';
import { AppendOnlyDeployError, type DeployRecord } from './deploy.types';

type DeployRow = {
  id: string;
  projectId: string;
  deploymentId: string;
  environment: string;
  title: string;
  dateStarted: Date;
  dateFinished: Date | null;
  url: string | null;
  closedAt: Date | null;
  createdAt: Date;
};

const toRecord = (row: DeployRow): DeployRecord => ({
  projectId: row.projectId,
  deploymentId: row.deploymentId,
  environment: row.environment,
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
      where: { projectId, deploymentId, environment },
    });
    return row === null ? undefined : toRecord(row);
  }

  async append(input: {
    projectId: string;
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
          projectId: input.projectId,
          environment: input.environment,
          deploymentId: input.deploymentId,
          title: input.title,
          dateStarted: input.dateStarted,
          dateFinished: input.dateFinished ?? null,
          url: input.url ?? null,
        },
      });
      await this.audit.appendInTransaction(tx, input.projectId, {
        actor: input.actor,
        type: 'deploy.created',
        payload: {
          deploymentId: input.deploymentId,
          projectId: input.projectId,
          title: redact(input.title),
          // Client-supplied text is redacted before it enters the append-only audit chain.
          environment: redact(input.environment),
        },
      });
      return toRecord(row);
    });
  }

  async list(projectId?: string, filter: DeployListFilter = {}): Promise<DeployRecord[]> {
    const rows = await this.db.deploy.findMany({
      where: {
        ...(projectId === undefined ? {} : { projectId }),
        ...(filter.deploymentId === undefined ? {} : { deploymentId: filter.deploymentId }),
        ...(filter.environment === undefined ? {} : { environment: filter.environment }),
      },
      // Order by the columns of deploys_project_id_created_at_id_idx so a filtered
      // list uses the index instead of a sort.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toRecord);
  }

  /** Closes the first Deployment for this SHA in one Environment. Later events write no entry. */
  async closeFirst(projectId: string, deploymentId: string, environment: string): Promise<boolean> {
    return inAuditTransaction(this.db, async (tx) => {
      const closed = await tx.deploy.updateMany({
        where: { projectId, deploymentId, closedAt: null, environment },
        data: { closedAt: new Date() },
      });
      if (closed.count === 0) return false;
      await this.audit.appendInTransaction(tx, projectId, {
        actor: 'daemon',
        type: 'deployment.closed',
        payload: { deploymentId, projectId, environment: redact(environment) },
      });
      return true;
    });
  }

  /** The poll uses these keys to stop serving events for a closed Deployment only. */
  async listClosed(
    projectId: string,
  ): Promise<Array<{ deploymentId: string; environment: string }>> {
    const rows = await this.db.deploy.findMany({
      where: { projectId, closedAt: { not: null } },
      select: { deploymentId: true, environment: true },
    });
    return rows.map((row) => ({
      deploymentId: row.deploymentId,
      environment: row.environment,
    }));
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
