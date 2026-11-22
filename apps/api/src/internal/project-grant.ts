import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import { DEFAULT_DAEMON_GRANT, IDENTITY_REPO, type IdentityRepo } from '../identity/identity.types';

const NUMERIC_ID = /^\d{1,20}$/;

/** One stored grant lists the Projects an internal integration may serve. */
@Injectable()
export class ProjectGrant {
  constructor(@Inject(IDENTITY_REPO) private readonly identity: IdentityRepo) {}

  async assert(projectId: string): Promise<void> {
    if (!NUMERIC_ID.test(projectId)) throw new ForbiddenException('Project id must be numeric');
    const grant = await this.identity.findGrant(DEFAULT_DAEMON_GRANT);
    if (grant === undefined || !grant.projectIds.includes(projectId)) {
      throw new ForbiddenException('This Project is not granted to this integration');
    }
  }
}
