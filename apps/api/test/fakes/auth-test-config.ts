import { loadGraveshiftConfig } from '@graveshift/config';

import type { AuthConfig } from '../../src/auth/auth.types';
import { loadBootConfig } from '../../src/config/boot.config';
import { rootEnvSchema, type OAuthClientConfig } from '../../src/config/env.schema';
import { ConfigService } from '@nestjs/config';

export const TEST_JWT_SECRET = 'graveshift-test-only-secret-32chars';
export const TEST_CLIENT_SECRET = 'test-client-secret-123456';

export const TEST_OAUTH_CLIENTS: Record<string, OAuthClientConfig> = {
  'client-1': {
    secret: TEST_CLIENT_SECRET,
    projectId: '12345',
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
    projectId: 'project-2',
    scopes: ['tokens:manage', 'incidents:read', 'events:publish'],
  },
};

export const TEST_CONFIG: AuthConfig = {
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

export const TEST_ROOT_ENV = {
  DATABASE_URL: 'postgresql://local_test:local_test@127.0.0.1:5436/graveshift_test',
  GRAVESHIFT_PROJECT_ID: '12345',
  GRAVESHIFT_API_INTERNAL_TOKEN: 'graveshift-test-api-internal-only-32chars',
  GRAVESHIFT_DAEMON_INTERNAL_TOKEN: 'graveshift-test-daemon-internal-32chars',
  GRAVESHIFT_OAUTH_JWT_SECRET: TEST_JWT_SECRET,
};

export async function testBootConfig() {
  const env = rootEnvSchema.parse(TEST_ROOT_ENV);
  return loadBootConfig(new ConfigService(env), await loadGraveshiftConfig());
}
