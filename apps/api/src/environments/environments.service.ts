import { Injectable } from '@nestjs/common';

import type { DeployPrincipal, EnvironmentRecord } from '../deploys/deploy.types';
import { EnvironmentRepo } from './environment.repo';

@Injectable()
export class EnvironmentsService {
  constructor(private readonly repo: EnvironmentRepo) {}

  list(principal: DeployPrincipal): Promise<EnvironmentRecord[]> {
    return this.repo.list(principal.orgId);
  }
}
