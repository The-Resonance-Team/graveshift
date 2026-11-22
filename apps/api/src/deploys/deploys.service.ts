import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import { EnvironmentRepo } from '../environments/environment.repo';
import { IDENTITY_REPO, type IdentityRepo } from '../identity/identity.types';
import { ReleaseRepo } from '../releases/release.repo';
import type { CreateDeployDto } from './dto/create-deploy.dto';
import { DeployRepo } from './deploy.repo';
import {
  assertProjectBound,
  readProjectFilter,
  type DeployPrincipal,
  type DeployRecord,
} from './deploy.types';

@Injectable()
export class DeploysService {
  constructor(
    private readonly repo: DeployRepo,
    private readonly releases: ReleaseRepo,
    private readonly environments: EnvironmentRepo,
    @Inject(IDENTITY_REPO) private readonly identity: IdentityRepo,
  ) {}

  async create(principal: DeployPrincipal, dto: CreateDeployDto): Promise<DeployRecord> {
    const release = await this.releases.findById(dto.releaseId);
    if (release === undefined || release.orgId !== principal.orgId) {
      throw new ForbiddenException('The Release is not in the caller Organization');
    }
    const targets = [...new Set(dto.projects ?? release.projectIds)];
    await Promise.all(
      targets.map(async (projectId) => {
        if (!release.projectIds.includes(projectId)) {
          throw new ForbiddenException('A Project is not linked to the Release');
        }
        const project = await this.identity.findProject(projectId);
        if (project === undefined || project.orgId !== principal.orgId) {
          throw new ForbiddenException('A Project is outside the caller Organization');
        }
      }),
    );
    assertProjectBound(principal, targets);
    const environment = await this.environments.findOrCreate(principal.orgId, dto.environment);
    return this.repo.append({
      orgId: principal.orgId,
      releaseId: release.id,
      environmentId: environment.record.id,
      name: dto.name,
      dateStarted: dto.dateStarted,
      dateFinished: dto.dateFinished,
      url: dto.url,
      projectIds: targets,
      actor: principal.clientId,
      auditEnvironment: environment.created,
    });
  }

  list(principal: DeployPrincipal): Promise<DeployRecord[]> {
    return this.repo.list(principal.orgId, readProjectFilter(principal));
  }
}
