import { z } from 'zod';

// Empty KEY= entries must reach the schema default, not an empty string.
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

// This schema validates boot config only. Request bodies use class-validator DTOs.
export const envSchema = z
  .object({
    NODE_ENV: z.preprocess(emptyToUndefined, z.string().default('development')),
    GRAVESHIFT_CREDENTIALS_PATH: z.preprocess(
      emptyToUndefined,
      z.string().default('.graveshift/credentials.json'),
    ),
    GRAVESHIFT_OAUTH_JWT_SECRET: z.preprocess(
      emptyToUndefined,
      z.string().min(32).default('graveshift-dev-only-secret-change-before-release'),
    ),
    GRAVESHIFT_OAUTH_ISSUER: z.preprocess(emptyToUndefined, z.string().default('graveshift-api')),
    GRAVESHIFT_OAUTH_AUDIENCE: z.preprocess(
      emptyToUndefined,
      z.string().default('graveshift-credentials'),
    ),
    GRAVESHIFT_CREDENTIAL_TTL_SECONDS: z.coerce.number().int().min(60).default(86_400),
    GRAVESHIFT_CREDENTIAL_MAX_TTL_SECONDS: z.coerce.number().int().min(60).default(2_592_000),
    GRAVESHIFT_EVENT_MAX_BYTES: z.coerce.number().int().min(1024).default(65_536),
    GRAVESHIFT_EVENT_RATE_LIMIT: z.coerce.number().int().min(1).default(60),
    GRAVESHIFT_EVENT_RATE_TTL_MS: z.coerce.number().int().min(1000).default(60_000),
    GRAVESHIFT_NATS_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  })
  .loose();

export type Env = z.infer<typeof envSchema>;
