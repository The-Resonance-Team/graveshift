import type { AuthConfig } from '../../src/auth/auth.types';
import type { OAuthClientConfig } from '../../src/auth/env.schema';

export const TEST_JWT_SECRET = 'graveshift-test-only-secret-32chars';
export const TEST_CLIENT_SECRET = 'test-client-secret-123456';

export const TEST_OAUTH_CLIENTS: Record<string, OAuthClientConfig> = {
  'client-1': {
    secret: TEST_CLIENT_SECRET,
    tenantId: 'tenant-1',
    scopes: [
      'tokens:manage',
      'incidents:read',
      'diagnoses:read',
      'audit:read',
      'logs:read',
      'metrics:read',
      'fix:propose',
      'events:publish',
    ],
  },
  'client-2': {
    secret: 'test-client-secret-654321',
    tenantId: 'tenant-2',
    scopes: ['tokens:manage', 'incidents:read'],
  },
};

export const TEST_CONFIG: AuthConfig = {
  credentialsPath: '/nonexistent/credentials.json',
  jwtSecret: TEST_JWT_SECRET,
  jwtIssuer: 'graveshift-api',
  jwtAudience: 'graveshift-credentials',
  defaultTtlSeconds: 3600,
  maxTtlSeconds: 86_400,
  maxEventBytes: 2048,
  eventRateLimit: 100,
  eventRateTtlMs: 60_000,
  oauthClients: TEST_OAUTH_CLIENTS,
};
