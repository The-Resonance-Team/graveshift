import { createHash } from 'node:crypto';
import { loadGraveshiftConfig } from '@graveshift/config';

import type { AuthConfig } from '../../src/auth/auth.types';
import { expandScopes } from '../../src/auth/scopes';
import { loadBootConfig } from '../../src/config/boot.config';
import { rootEnvSchema } from '../../src/config/env.schema';
import type { OAuthClientRecord } from '../../src/identity/identity.types';
import { ConfigService } from '@nestjs/config';

export const TEST_JWT_SECRET = 'graveshift-test-only-secret-32chars';
export const TEST_CLIENT_SECRET = 'test-client-secret-123456';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Test-only client registry. No real secret or credential value is used. */
export const TEST_CLIENT_SECRETS: Record<string, string> = {
  'client-1': TEST_CLIENT_SECRET,
  'client-2': 'test-client-secret-654321',
  'client-config-export': 'test-client-secret-config-export',
  'client-no-config': 'test-client-secret-no-config',
};

const TEST_CLIENT_GRANTS: Record<string, { projectId: string; scopes: string[] }> = {
  'client-1': {
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
    projectId: '12346',
    scopes: ['tokens:manage', 'incidents:read', 'events:publish'],
  },
  'client-config-export': { projectId: '12345', scopes: ['config:export'] },
  'client-no-config': { projectId: '12345', scopes: ['incidents:read'] },
};

export function testOAuthClients(): OAuthClientRecord[] {
  return Object.entries(TEST_CLIENT_GRANTS).map(([clientId, grant]) => ({
    clientId,
    secretHash: digest(TEST_CLIENT_SECRETS[clientId] ?? 'missing-test-secret'),
    orgId: 'test-org',
    projectId: grant.projectId,
    scopes: expandScopes(grant.scopes),
  }));
}

export const TEST_CONFIG: AuthConfig = {
  jwtSecret: TEST_JWT_SECRET,
  jwtIssuer: 'graveshift-api',
  jwtAudience: 'graveshift-credentials',
  defaultTtlSeconds: 3600,
  maxTtlSeconds: 86_400,
  maxEventBytes: 2048,
  eventRateLimit: 100,
  eventRateTtlMs: 60_000,
};

export const TEST_ROOT_ENV = {
  DATABASE_URL: 'postgresql://local_test:local_test@127.0.0.1:5436/graveshift_test',
  GRAVESHIFT_API_INTERNAL_TOKEN: 'graveshift-test-api-internal-only-32chars',
  GRAVESHIFT_DAEMON_INTERNAL_TOKEN: 'graveshift-test-daemon-internal-32chars',
  GRAVESHIFT_OAUTH_JWT_SECRET: TEST_JWT_SECRET,
};

export async function testBootConfig() {
  const env = rootEnvSchema.parse(TEST_ROOT_ENV);
  return loadBootConfig(new ConfigService(env), await loadGraveshiftConfig());
}
