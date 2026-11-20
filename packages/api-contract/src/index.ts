import type { paths } from './generated/api';

export const API_CONTRACT_VERSION = '0.1.0' as const;

export type { paths } from './generated/api';

export type HealthResponse =
  paths['/healthz']['get']['responses'][200]['content']['application/json'];

export type WorkItemListResponse =
  paths['/api/work-items']['get']['responses'][200]['content']['application/json'];

export type WorkItemResponse =
  paths['/api/work-items/{id}']['get']['responses'][200]['content']['application/json'];
