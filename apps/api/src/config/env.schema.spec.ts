import { describe, expect, test } from 'bun:test';

import { TEST_ROOT_ENV } from '../../test/fakes/auth-test-config';
import { rootEnvSchema } from './env.schema';

const SECRET_MESSAGE = 'GRAVESHIFT_OAUTH_JWT_SECRET must be set to at least 32 characters';

const base = {
  ...TEST_ROOT_ENV,
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
    const result = rootEnvSchema.safeParse({ ...base, GRAVESHIFT_OAUTH_JWT_SECRET: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === SECRET_MESSAGE)).toBe(true);
    }
  });

  test('fails in production when the JWT secret is unset', () => {
    const result = rootEnvSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      GRAVESHIFT_OAUTH_JWT_SECRET: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === SECRET_MESSAGE)).toBe(true);
    }
  });

  test('fails for a short placeholder secret', () => {
    const result = rootEnvSchema.safeParse({ ...base, GRAVESHIFT_OAUTH_JWT_SECRET: 'changeme' });
    expect(result.success).toBe(false);
  });

  test('rejects the example placeholder secret', () => {
    const result = rootEnvSchema.safeParse({
      ...base,
      GRAVESHIFT_OAUTH_JWT_SECRET: 'replace-with-a-32-character-or-longer-secret',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) =>
            issue.message === 'GRAVESHIFT_OAUTH_JWT_SECRET is still an example placeholder',
        ),
      ).toBe(true);
    }
  });

  test('no host-wide Project id key is accepted by the boot schema', () => {
    const result = rootEnvSchema.parse(base);
    expect(result).not.toHaveProperty('GRAVESHIFT_PROJECT_ID');
    const withLegacy = rootEnvSchema.parse({ ...base, GRAVESHIFT_PROJECT_ID: 'local' });
    expect(withLegacy).not.toHaveProperty('GRAVESHIFT_PROJECT_ID');
  });

  test('root admin keys are optional together and validate their shape', () => {
    const root = {
      GRAVESHIFT_ROOT_ADMIN_EMAIL: 'root@example.test',
      GRAVESHIFT_ROOT_ADMIN_PASSWORD: 'root-only-test-password',
      GRAVESHIFT_ROOT_ORG_NAME: 'Root Org',
      GRAVESHIFT_ROOT_ORG_SLUG: 'root-org',
    };
    expect(rootEnvSchema.safeParse({ ...base, ...root }).success).toBe(true);
    expect(
      rootEnvSchema.safeParse({ ...base, ...root, GRAVESHIFT_ROOT_ORG_SLUG: 'Bad' }).success,
    ).toBe(false);
    const partial = { ...base, GRAVESHIFT_ROOT_ADMIN_EMAIL: 'root@example.test' };
    expect(rootEnvSchema.safeParse(partial).success).toBe(false);
  });

  test('accepts a strong secret', () => {
    const result = rootEnvSchema.safeParse({
      ...base,
      GRAVESHIFT_OAUTH_JWT_SECRET: 'a-strong-secret-of-32-chars-minimum',
    });
    expect(result.success).toBe(true);
  });

  test.each(['DATABASE_URL', 'GRAVESHIFT_API_INTERNAL_TOKEN', 'GRAVESHIFT_DAEMON_INTERNAL_TOKEN'])(
    'requires %s without a production fallback',
    (key) => {
      expect(rootEnvSchema.safeParse({ ...base, [key]: undefined }).success).toBe(false);
      expect(rootEnvSchema.safeParse({ ...base, [key]: '' }).success).toBe(false);
    },
  );

  test.each([
    { DATABASE_URL: 'https://database.example.test/db' },
    { DATABASE_URL: 'postgresql:missing-host' },
    { DATABASE_URL: 'invalid' },
    { GRAVESHIFT_API_URL: 'invalid' },
    { GRAVESHIFT_NATS_URL: 'invalid' },
    { GRAVESHIFT_NATS_URL: 'nats:missing-host' },
    { GRAVESHIFT_API_INTERNAL_TOKEN: `${'x'.repeat(32)}\n` },
    { GRAVESHIFT_DAEMON_INTERNAL_TOKEN: `${'x'.repeat(32)}\n` },
    { PORT: 0 },
    { PORT: 65_536 },
    { HOST: 'http://127.0.0.1' },
    { GRAVESHIFT_API_INTERNAL_TOKEN: 'replace-with-a-real-long-internal-token' },
    { GRAVESHIFT_DAEMON_INTERNAL_TOKEN: 'replace-with-a-real-long-internal-token' },
    { GRAVESHIFT_API_URL: 'https://remote.example.test' },
    { GRAVESHIFT_API_URL: 'http://127.attacker.example.test:3000' },
    {
      GRAVESHIFT_PRIVATE_HOST: '10.attacker.example.test',
      GRAVESHIFT_DAEMON_URL: 'http://10.attacker.example.test:2602',
    },
    { GRAVESHIFT_DAEMON_URL: 'http://192.168.1.1:2602' },
    { GRAVESHIFT_DAEMON_READ_URL: 'https://remote.example.test' },
    { GRAVESHIFT_DAEMON_READ_URL: 'http://192.168.1.1:2602' },
    {
      GRAVESHIFT_PRIVATE_HOST: '10.attacker.example.test',
      GRAVESHIFT_DAEMON_READ_URL: 'http://10.attacker.example.test:2602',
    },
    { GRAVESHIFT_DAEMON_READ_URL: 'http://secret@127.0.0.1:2602' },
    { GRAVESHIFT_API_URL: 'http://secret@127.0.0.1:3000' },
    { GRAVESHIFT_API_URL: 'http://127.0.0.1:3000/hidden' },
  ])('rejects invalid or remote boot settings: %j', (change) => {
    expect(rootEnvSchema.safeParse({ ...base, ...change }).success).toBe(false);
  });

  test('rejects identical API and daemon internal tokens', () => {
    const result = rootEnvSchema.safeParse({
      ...base,
      GRAVESHIFT_DAEMON_INTERNAL_TOKEN: base.GRAVESHIFT_API_INTERNAL_TOKEN,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.message === 'The API and daemon internal tokens must differ',
        ),
      ).toBe(true);
    }
  });

  test('allows only an explicitly configured private container host', () => {
    expect(
      rootEnvSchema.safeParse({
        ...base,
        GRAVESHIFT_PRIVATE_HOST: 'daemon',
        GRAVESHIFT_DAEMON_URL: 'http://daemon:2602',
        GRAVESHIFT_DAEMON_READ_URL: 'http://daemon:2602',
      }).success,
    ).toBe(true);
    expect(
      rootEnvSchema.safeParse({
        ...base,
        GRAVESHIFT_PRIVATE_HOST: 'remote.example.test',
        GRAVESHIFT_DAEMON_URL: 'https://remote.example.test',
        GRAVESHIFT_DAEMON_READ_URL: 'https://remote.example.test',
      }).success,
    ).toBe(false);
  });

  test('the OAuth client registry is not read from the environment', () => {
    const result = rootEnvSchema.parse(base);
    expect(result).not.toHaveProperty('GRAVESHIFT_OAUTH_CLIENTS');
  });

  test('empty optional settings use schema defaults without a global auto-fix flag', () => {
    const result = rootEnvSchema.parse({
      ...base,
      HOST: '',
      PORT: '',
      GRAVESHIFT_NATS_URL: '',
      GRAVESHIFT_EVENT_RATE_LIMIT: '',
      GRAVESHIFT_AUTO_FIX: 'true',
    });
    expect(result.HOST).toBe('127.0.0.1');
    expect(result.PORT).toBe(3000);
    expect(result.GRAVESHIFT_NATS_URL).toBeUndefined();
    expect(result.GRAVESHIFT_EVENT_RATE_LIMIT).toBe(60);
    expect(result).not.toHaveProperty('GRAVESHIFT_AUTO_FIX');
  });

  test('the gateway defaults disable spending and retain bounded retry and timeout settings', () => {
    for (const value of [undefined, '']) {
      const env = rootEnvSchema.parse({ ...base, GRAVESHIFT_GATEWAY_CONFIG: value });
      expect(env.GRAVESHIFT_GATEWAY_CONFIG).toEqual({
        globalDailyBudgetUsd: 0,
        maxRetries: 1,
        timeoutMs: 30_000,
        priceTableUsdPer1M: {},
      });
    }
  });

  test('accepts gateway JSON through the canonical gateway schema', () => {
    const gateway = {
      globalDailyBudgetUsd: 2,
      maxRetries: 1,
      timeoutMs: 30_000,
      priceTableUsdPer1M: { 'test-model': { in: 1, out: 2 } },
    };
    const env = rootEnvSchema.parse({
      ...base,
      GRAVESHIFT_GATEWAY_CONFIG: JSON.stringify(gateway),
    });
    expect(env.GRAVESHIFT_GATEWAY_CONFIG).toEqual(gateway);
  });

  test.each([
    '{not json',
    '{}',
    JSON.stringify({
      globalDailyBudgetUsd: -1,
      maxRetries: 1,
      timeoutMs: 30_000,
      priceTableUsdPer1M: {},
    }),
    JSON.stringify({
      globalDailyBudgetUsd: 0,
      maxRetries: -1,
      timeoutMs: 30_000,
      priceTableUsdPer1M: {},
    }),
    JSON.stringify({
      globalDailyBudgetUsd: 0,
      maxRetries: 1,
      timeoutMs: 0,
      priceTableUsdPer1M: {},
    }),
    JSON.stringify({
      globalDailyBudgetUsd: 0,
      maxRetries: 1,
      timeoutMs: 30_000,
      priceTableUsdPer1M: {},
      apiKey: 'untrusted-value',
    }),
    JSON.stringify({
      globalDailyBudgetUsd: 0,
      maxRetries: 1,
      timeoutMs: 30_000,
      priceTableUsdPer1M: { model: { in: -1, out: 0 } },
    }),
  ])('rejects malformed or invalid gateway settings at boot: %s', (value) => {
    expect(rootEnvSchema.safeParse({ ...base, GRAVESHIFT_GATEWAY_CONFIG: value }).success).toBe(
      false,
    );
  });
});
