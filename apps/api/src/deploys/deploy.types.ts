import { ForbiddenException } from '@nestjs/common';

/** Scope carried on every request by the verified OAuth client. */
export interface DeployPrincipal {
  clientId: string;
  orgId: string;
  projectId: string;
  scopes: string[];
}

/** Only org-wide scopes may read another Project's rows in the Organization. */
export function readProjectFilter(principal: DeployPrincipal): string | undefined {
  return principal.scopes.includes('org:read') || principal.scopes.includes('org:ci')
    ? undefined
    : principal.projectId;
}

/** A client without org:ci may write only its bound Project. */
export function assertProjectBound(
  principal: DeployPrincipal,
  projectIds: readonly string[],
): void {
  if (principal.scopes.includes('org:ci')) return;
  if (projectIds.some((projectId) => projectId !== principal.projectId)) {
    throw new ForbiddenException('A Project is outside the bound Project of this client');
  }
}

export interface ReleaseRecord {
  id: string;
  orgId: string;
  version: string;
  createdAt: string;
  projectIds: string[];
}

export interface EnvironmentRecord {
  id: string;
  orgId: string;
  name: string;
  createdAt: string;
}

export interface DeployRecord {
  id: string;
  orgId: string;
  releaseId: string;
  environmentId: string;
  environment: string;
  name: string;
  dateStarted: string;
  dateFinished: string | null;
  url: string | null;
  createdAt: string;
  projectIds: string[];
}

/** The repository rejects every write that would change or remove a Deploy. */
export class AppendOnlyDeployError extends Error {
  constructor() {
    super('Deploy is append-only');
    this.name = 'AppendOnlyDeployError';
  }
}
