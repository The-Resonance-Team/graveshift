import { randomUUID } from 'node:crypto';

import type { DeployRecord, EnvironmentRecord } from '../deploy.types';

/** In-memory Environment store for HTTP tests. No database or network call is made. */
export class FakeEnvironmentRepo {
  readonly rows = new Map<string, EnvironmentRecord>();
  deploys?: FakeDeployRepo;

  async createWithAudit(input: {
    orgId: string;
    name: string;
    projectId: string;
    deploymentId: string;
    actor: string;
  }): Promise<{ record: EnvironmentRecord; created: boolean }> {
    const existing = [...this.rows.values()].find(
      (row) => row.orgId === input.orgId && row.name === input.name,
    );
    if (existing !== undefined) return { record: existing, created: false };
    const record: EnvironmentRecord = {
      id: randomUUID(),
      orgId: input.orgId,
      name: input.name,
      createdAt: new Date().toISOString(),
    };
    this.rows.set(record.id, record);
    return { record, created: true };
  }

  async list(orgId: string, projectId?: string): Promise<EnvironmentRecord[]> {
    return [...this.rows.values()].filter(
      (row) =>
        row.orgId === orgId &&
        (projectId === undefined ||
          [...(this.deploys?.rows.values() ?? [])].some(
            (deploy) => deploy.environment === row.name && deploy.projectId === projectId,
          )),
    );
  }
}

/** In-memory Deployment store for HTTP tests. The uuid row key stays internal. */
export class FakeDeployRepo {
  readonly rows = new Map<string, DeployRecord>();
  readonly auditTypes: string[] = [];

  private key(projectId: string, deploymentId: string, environment: string): string {
    return JSON.stringify([projectId, deploymentId, environment]);
  }

  async findByDeployment(
    projectId: string,
    deploymentId: string,
    environment: string,
  ): Promise<DeployRecord | undefined> {
    return this.rows.get(this.key(projectId, deploymentId, environment));
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
    const record: DeployRecord = {
      orgId: input.orgId,
      projectId: input.projectId,
      deploymentId: input.deploymentId,
      environment: input.environment,
      title: input.title,
      dateStarted: input.dateStarted.toISOString(),
      dateFinished: input.dateFinished?.toISOString() ?? null,
      url: input.url ?? null,
      closedAt: null,
      createdAt: new Date().toISOString(),
    };
    const key = this.key(input.projectId, input.deploymentId, input.environment);
    this.rows.set(key, record);
    this.auditTypes.push('deploy.created');
    return record;
  }

  async list(
    orgId: string,
    projectId?: string,
    filter: { deploymentId?: string; environment?: string } = {},
  ): Promise<DeployRecord[]> {
    return [...this.rows.values()].filter(
      (row) =>
        row.orgId === orgId &&
        (projectId === undefined || row.projectId === projectId) &&
        (filter.deploymentId === undefined || row.deploymentId === filter.deploymentId) &&
        (filter.environment === undefined || row.environment === filter.environment),
    );
  }

  async closeFirst(projectId: string, deploymentId: string, environment: string): Promise<boolean> {
    for (const [key, row] of this.rows) {
      if (
        row.projectId === projectId &&
        row.deploymentId === deploymentId &&
        row.environment === environment &&
        row.closedAt === null
      ) {
        this.rows.set(key, { ...row, closedAt: new Date().toISOString() });
        this.auditTypes.push('deployment.closed');
        return true;
      }
    }
    return false;
  }

  async listClosedIds(projectId: string): Promise<string[]> {
    return [...this.rows.values()]
      .filter((row) => row.projectId === projectId && row.closedAt !== null)
      .map((row) => row.deploymentId);
  }
}
