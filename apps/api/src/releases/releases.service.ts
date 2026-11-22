import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';

import type { DeployPrincipal, ReleaseRecord } from '../deploys/deploy.types';
import { IDENTITY_REPO, type IdentityRepo } from '../identity/identity.types';
import type { CreateReleaseDto } from './dto/create-release.dto';
import { ReleaseRepo } from './release.repo';

@Injectable()
export class ReleasesService {
  constructor(
    private readonly repo: ReleaseRepo,
    @Inject(IDENTITY_REPO) private readonly identity: IdentityRepo,
  ) {}

  async create(principal: DeployPrincipal, dto: CreateReleaseDto): Promise<ReleaseRecord> {
    const projects = await Promise.all(
      [...new Set(dto.projects)].map(async (projectId) => {
        const project = await this.identity.findProject(projectId);
        if (project === undefined || project.orgId !== principal.orgId) {
          throw new ForbiddenException('A Project is outside the caller Organization');
        }
        return projectId;
      }),
    );
    if ((await this.repo.findByVersion(principal.orgId, dto.version)) !== undefined) {
      throw new ConflictException('The Release version is already used in this Organization');
    }
    return this.repo.create({ orgId: principal.orgId, version: dto.version, projectIds: projects });
  }

  list(principal: DeployPrincipal): Promise<ReleaseRecord[]> {
    return this.repo.list(principal.orgId);
  }
}
