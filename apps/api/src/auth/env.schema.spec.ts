import { describe, expect, test } from 'bun:test';

import { envSchema } from './env.schema';

const SECRET_MESSAGE = 'GRAVESHIFT_OAUTH_JWT_SECRET must be set to at least 32 characters';

const base = {
  NODE_ENV: 'development',
  GRAVESHIFT_OAUTH_ISSUER: 'graveshift-api',
  GRAVESHIFT_OAUTH_AUDIENCE: 'graveshift-credentials',
  GRAVESHIFT_CREDENTIAL_TTL_SECONDS: '3600',
  GRAVESHIFT_CREDENTIAL_MAX_TTL_SECONDS: '86400',
  GRAVESHIFT_EVENT_MAX_BYTES: '2048',
  GRAVESHIFT_EVENT_RATE_LIMIT: '60',
  GRAVESHIFT_EVENT_RATE_TTL_MS: '60000',
};

describe('boot env config', () => {
  test('fails in development when the JWT secret is unset', () => {
    const result = envSchema.safeParse(base);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === SECRET_MESSAGE)).toBe(true);
    }
  });

  test('fails in production when the JWT secret is unset', () => {
    const result = envSchema.safeParse({ ...base, NODE_ENV: 'production' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === SECRET_MESSAGE)).toBe(true);
    }
  });

  test('fails for a short placeholder secret', () => {
    const result = envSchema.safeParse({ ...base, GRAVESHIFT_OAUTH_JWT_SECRET: 'changeme' });
    expect(result.success).toBe(false);
  });

  test('rejects the example placeholder secret', () => {
    const result = envSchema.safeParse({
      ...base,
      GRAVESHIFT_OAUTH_JWT_SECRET: 'replace-with-a-32-character-or-longer-secret',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) =>
            issue.message === 'GRAVESHIFT_OAUTH_JWT_SECRET is still the example placeholder',
        ),
      ).toBe(true);
    }
  });

  test('the OAuth client registry is not read from the environment', () => {
    const result = envSchema.safeParse(base);
    expect(result.success).toBe(false);
    expect(base).not.toHaveProperty('GRAVESHIFT_OAUTH_CLIENTS');
  });

  test('accepts a strong secret', () => {
    const result = envSchema.safeParse({
      ...base,
      GRAVESHIFT_OAUTH_JWT_SECRET: 'a-strong-secret-of-32-chars-minimum',
    });
    expect(result.success).toBe(true);
  });
});
