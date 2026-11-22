import { ForbiddenException } from '@nestjs/common';

import type { ProjectGrant } from '../project-grant';

/** Test double for the stored deployment grant. No database call is made. */
export function testProjectGrant(projectIds: string[]): ProjectGrant {
  return {
    async assert(projectId: string): Promise<void> {
      if (!projectIds.includes(projectId)) throw new ForbiddenException('Project is not granted');
    },
    async first(): Promise<string> {
      const projectId = projectIds[0];
      if (projectId === undefined) throw new ForbiddenException('No Project is granted');
      return projectId;
    },
  } as ProjectGrant;
}
