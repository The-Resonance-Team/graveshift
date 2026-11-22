import { ForbiddenException } from '@nestjs/common';

import type { ProjectGrant } from '../project-grant';

/** Test double for the stored deployment grant. No database call is made. */
export function testProjectGrant(projectIds: string[]): ProjectGrant {
  return {
    async assert(projectId: string): Promise<void> {
      if (!projectIds.includes(projectId)) throw new ForbiddenException('Project is not granted');
    },
  } as ProjectGrant;
}
