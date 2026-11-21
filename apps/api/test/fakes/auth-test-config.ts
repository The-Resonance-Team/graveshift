import type { AuthConfig } from '../../src/auth/auth.types';

export const TEST_CONFIG: AuthConfig = {
  credentialsPath: '/nonexistent/credentials.json',
  jwtSecret: 'graveshift-test-only-secret-32chars',
  jwtIssuer: 'graveshift-api',
  jwtAudience: 'graveshift-credentials',
  defaultTtlSeconds: 3600,
  maxTtlSeconds: 86_400,
  maxEventBytes: 2048,
  eventRateLimit: 100,
  eventRateTtlMs: 60_000,
};
