import type { RecordedHaunting } from '@graveshift/core/recorded';
import { Injectable } from '@nestjs/common';

import { DeployRepo } from './deploy.repo';

export interface DeploymentClosureEvent {
  projectId: string;
  environment?: string | null;
  view: RecordedHaunting;
}

/**
 * ADR-0027 in one place. The first Event fixes the opening Deployment pair.
 * A later Event closes that Deployment only when its own SHA and Environment
 * both equal the opening pair.
 */
export function openingDeploymentPair(
  prior: RecordedHaunting | undefined,
  next: RecordedHaunting,
  eventEnvironment?: string | null,
): Pick<RecordedHaunting, 'deploymentId' | 'deploymentEnvironment'> {
  if (prior?.deploymentId !== null && prior?.deploymentId !== undefined) {
    return {
      deploymentId: prior.deploymentId,
      deploymentEnvironment: prior.deploymentEnvironment ?? null,
    };
  }
  if (next.deploymentId !== null && next.deploymentId !== undefined) {
    // The first bound Event fixes SHA and Environment together.
    return {
      deploymentId: next.deploymentId,
      deploymentEnvironment: next.deploymentEnvironment ?? eventEnvironment ?? null,
    };
  }
  // An unbound Event carries no Deployment, so it cannot supply an Environment either.
  return { deploymentId: null, deploymentEnvironment: null };
}

@Injectable()
export class DeploymentClosure {
  constructor(private readonly deploys: DeployRepo) {}

  /** Compare the recorded pair with the Event pair, then close only the matching Deployment. */
  async apply(view: RecordedHaunting, event: DeploymentClosureEvent): Promise<void> {
    const opening = openingDeploymentPair(undefined, view, event.environment);
    const incoming = openingDeploymentPair(undefined, event.view, event.environment);
    const { deploymentId, deploymentEnvironment } = opening;
    if (
      deploymentId === null ||
      deploymentId === undefined ||
      deploymentEnvironment === null ||
      deploymentEnvironment === undefined ||
      incoming.deploymentId !== deploymentId ||
      incoming.deploymentEnvironment !== deploymentEnvironment
    )
      return;
    // DeployRepo.closeFirst performs the one transition and appends deployment.closed.
    await this.deploys.closeFirst(event.projectId, deploymentId, deploymentEnvironment);
  }
}
