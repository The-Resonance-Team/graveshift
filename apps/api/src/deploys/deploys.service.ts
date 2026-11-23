import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { EnvironmentRepo } from '../environments/environment.repo';
import { IDENTITY_REPO, type IdentityRepo } from '../identity/identity.types';
import type {
  CreateDeployDto,
  DeploymentListQueryDto,
  DeploymentParamsDto,
} from './dto/create-deploy.dto';
import { DeployRepo } from './deploy.repo';
import {
  assertProjectBound,
  readProjectFilter,
  type DeployPrincipal,
  type DeployRecord,
} from './deploy.types';

export interface CreateDeploymentResult {
  record: DeployRecord;
  created: boolean;
}

@Injectable()
export class DeploysService {
  constructor(
    private readonly repo: DeployRepo,
    private readonly environments: EnvironmentRepo,
    @Inject(IDENTITY_REPO) private readonly identity: IdentityRepo,
  ) {}

  async create(
    principal: DeployPrincipal,
    params: DeploymentParamsDto,
    dto: CreateDeployDto,
  ): Promise<CreateDeploymentResult> {
    const projectId = params.projectId;
    const project = await this.identity.findProject(projectId);
    if (project === undefined || project.orgId !== principal.orgId) {
      throw new ForbiddenException('The Project is outside the caller Organization');
    }
    assertProjectBound(principal, [projectId]);

    const existing = await this.repo.findByDeployment(projectId, dto.deploymentId, dto.environment);
    if (existing !== undefined) return { record: existing, created: false };

    const { record: environment } = await this.environments.createWithAudit({
      orgId: principal.orgId,
      name: dto.environment,
      projectId,
      actor: principal.clientId,
    });
    try {
      const record = await this.repo.append({
        orgId: principal.orgId,
        projectId,
        environmentId: environment.id,
        environment: environment.name,
        deploymentId: dto.deploymentId,
        title: dto.title,
        dateStarted: dto.dateStarted,
        dateFinished: dto.dateFinished,
        url: dto.url,
        actor: principal.clientId,
      });
      return { record, created: true };
    } catch (error) {
      // A concurrent redeploy can win the unique key between the lookup and the insert.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const winner = await this.repo.findByDeployment(projectId, dto.deploymentId, dto.environment);
      if (winner === undefined) throw error;
      return { record: winner, created: false };
    }
  }

  list(principal: DeployPrincipal, query: DeploymentListQueryDto): Promise<DeployRecord[]> {
    return this.repo.list(principal.orgId, readProjectFilter(principal), {
      ...(query.deploymentId === undefined ? {} : { deploymentId: query.deploymentId }),
      ...(query.environment === undefined ? {} : { environment: query.environment }),
    });
  }
}
