import type { ConfigService } from '@nestjs/config';
import { describe, expect, test } from 'bun:test';

import { createAuthConfig } from './auth.config.module';
import { envSchema } from './env.schema';

const base = {
  NODE_ENV: 'development',
  GRAVESHIFT_CREDENTIALS_PATH: '/tmp/graveshift-creds.json',
  GRAVESHIFT_OAUTH_ISSUER: 'graveshift-api',
  GRAVESHIFT_OAUTH_AUDIENCE: 'graveshift-credentials',
  GRAVESHIFT_CREDENTIAL_TTL_SECONDS: '3600',
  GRAVESHIFT_CREDENTIAL_MAX_TTL_SECONDS: '86400',
  GRAVESHIFT_EVENT_MAX_BYTES: '2048',
  GRAVESHIFT_EVENT_RATE_LIMIT: '60',
  GRAVESHIFT_EVENT_RATE_TTL_MS: '60000',
  GRAVESHIFT_OAUTH_CLIENTS:
    '{"client-1":{"secret":"test-client-secret-123456","tenantId":"tenant-1","scopes":["tokens:manage"]}}',
};

describe('boot env config', () => {
  test('fails in production when the JWT secret is unset', () => {
    const result = envSchema.safeParse({ ...base, NODE_ENV: 'production' });
    expect(result.success).toBe(false);
  });

  test('fails for a short placeholder secret', () => {
    const result = envSchema.safeParse({ ...base, GRAVESHIFT_OAUTH_JWT_SECRET: 'changeme' });
    expect(result.success).toBe(false);
  });

  test('accepts a strong secret', () => {
    const result = envSchema.safeParse({
      ...base,
      GRAVESHIFT_OAUTH_JWT_SECRET: 'a-strong-secret-of-32-chars-minimum',
    });
    expect(result.success).toBe(true);
  });

  test('the config factory uses getOrThrow for the secret', () => {
    const parsed = envSchema.parse({
      ...base,
      GRAVESHIFT_OAUTH_JWT_SECRET: 'a-strong-secret-of-32-chars-minimum',
    });
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'GRAVESHIFT_OAUTH_JWT_SECRET') throw new Error('missing secret');
        return (parsed as Record<string, unknown>)[key];
      },
      get: (key: string) => (parsed as Record<string, unknown>)[key],
    } as unknown as ConfigService;
    expect(() => createAuthConfig(config)).toThrow('missing secret');
  });
});
