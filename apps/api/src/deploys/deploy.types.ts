/** Scope carried on every request by the verified OAuth client. */
export interface DeployPrincipal {
  clientId: string;
  orgId: string;
  projectId: string;
  scopes: string[];
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
