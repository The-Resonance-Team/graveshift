import { randomUUID } from 'node:crypto';

import type { DeployRecord, EnvironmentRecord, ReleaseRecord } from '../deploy.types';

/** In-memory Release store for HTTP tests. No database or network call is made. */
export class FakeReleaseRepo {
  readonly rows = new Map<string, ReleaseRecord>();

  async create(input: {
    orgId: string;
    version: string;
    projectIds: string[];
  }): Promise<ReleaseRecord> {
    const record: ReleaseRecord = {
      id: randomUUID(),
      orgId: input.orgId,
      version: input.version,
      createdAt: new Date().toISOString(),
      projectIds: input.projectIds,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async findByVersion(orgId: string, version: string): Promise<ReleaseRecord | undefined> {
    return [...this.rows.values()].find((row) => row.orgId === orgId && row.version === version);
  }

  async findById(id: string): Promise<ReleaseRecord | undefined> {
    return this.rows.get(id);
  }

  async list(orgId: string): Promise<ReleaseRecord[]> {
    return [...this.rows.values()].filter((row) => row.orgId === orgId);
  }
}

/** In-memory Environment store for HTTP tests. */
export class FakeEnvironmentRepo {
  readonly rows = new Map<string, EnvironmentRecord>();

  async findOrCreate(orgId: string, name: string): Promise<EnvironmentRecord> {
    const existing = [...this.rows.values()].find(
      (row) => row.orgId === orgId && row.name === name,
    );
    if (existing !== undefined) return existing;
    const record: EnvironmentRecord = {
      id: randomUUID(),
      orgId,
      name,
      createdAt: new Date().toISOString(),
    };
    this.rows.set(record.id, record);
    return record;
  }

  async list(orgId: string): Promise<EnvironmentRecord[]> {
    return [...this.rows.values()].filter((row) => row.orgId === orgId);
  }
}

/** In-memory Deploy store for HTTP tests. */
export class FakeDeployRepo {
  readonly rows = new Map<string, DeployRecord>();

  constructor(private readonly environments: FakeEnvironmentRepo) {}

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
    const record: DeployRecord = {
      id: randomUUID(),
      orgId: input.orgId,
      releaseId: input.releaseId,
      environmentId: input.environmentId,
      environment:
        [...this.environments.rows.values()].find((row) => row.id === input.environmentId)?.name ??
        '',
      name: input.name,
      dateStarted: input.dateStarted.toISOString(),
      dateFinished: input.dateFinished?.toISOString() ?? null,
      url: input.url ?? null,
      createdAt: new Date().toISOString(),
      projectIds: input.projectIds,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async list(orgId: string): Promise<DeployRecord[]> {
    return [...this.rows.values()].filter((row) => row.orgId === orgId);
  }
}
