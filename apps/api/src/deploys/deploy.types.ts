import { ForbiddenException } from '@nestjs/common';

/** Scope carried on every request by the verified OAuth client. */
export interface DeployPrincipal {
  clientId: string;
  orgId: string;
  projectId: string;
  scopes: string[];
  /** The Project named in the route, set only on Project-scoped deploy routes. */
  routeProjectId?: string | undefined;
}

/** One of these scopes may read every Project in the Organization. */
export function canReadAllProjects(principal: DeployPrincipal): boolean {
  return principal.scopes.includes('org:read') || principal.scopes.includes('org:ci');
}

/** Only org-wide scopes may read another Project's rows in the Organization. */
export function readProjectFilter(principal: DeployPrincipal): string | undefined {
  return canReadAllProjects(principal) ? undefined : principal.projectId;
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

/** The API never exposes the internal uuid row key of a Deployment. */
export interface DeployRecord {
  projectId: string;
  deploymentId: string;
  environment: string;
  title: string;
  dateStarted: string;
  dateFinished: string | null;
  url: string | null;
  closedAt: string | null;
  createdAt: string;
}

/** The repository rejects every write that would change or remove a Deployment row. */
export class AppendOnlyDeployError extends Error {
  constructor() {
    super('Deploy is append-only');
    this.name = 'AppendOnlyDeployError';
  }
}
