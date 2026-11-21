import type { paths } from './generated/api';

export const API_CONTRACT_VERSION = '0.1.0' as const;

export type { paths } from './generated/api';

export type HealthResponse =
  paths['/healthz']['get']['responses'][200]['content']['application/json'];

export type WorkItemListResponse =
  paths['/api/work-items']['get']['responses'][200]['content']['application/json'];

export type WorkItemResponse =
  paths['/api/work-items/{id}']['get']['responses'][200]['content']['application/json'];

export type TriageRequest =
  paths['/api/work-items/{id}/triage']['post']['requestBody']['content']['application/json'];

export type TriageResponse =
  paths['/api/work-items/{id}/triage']['post']['responses'][200]['content']['application/json'];

export type FixNowRequest =
  paths['/api/work-items/{id}/fix-now']['post']['requestBody']['content']['application/json'];

export type FixNowResponse =
  paths['/api/work-items/{id}/fix-now']['post']['responses'][200]['content']['application/json'];

export type Assignee = WorkItemResponse['assignee'];
