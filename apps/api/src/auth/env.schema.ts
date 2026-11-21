import { z } from 'zod';

// Empty KEY= entries must reach the schema default, not an empty string.
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const oauthClientSchema = z.object({
  secret: z.string().min(16),
  tenantId: z.string().regex(/^[A-Za-z0-9_-]+$/),
  scopes: z.array(z.string()),
});

export const oauthClientsDefault: Record<string, z.infer<typeof oauthClientSchema>> = {};

// This schema validates boot config only. Request bodies use class-validator DTOs.
export const envSchema = z
  .object({
    NODE_ENV: z.preprocess(emptyToUndefined, z.string().default('development')),
    // Local-only placeholder. #74 will move this key into the single root boot schema.
    DATABASE_URL: z.preprocess(
      emptyToUndefined,
      z.string().url().default('postgresql://graveshift@localhost:5436/graveshift'),
    ),
    GRAVESHIFT_CREDENTIALS_PATH: z.preprocess(
      emptyToUndefined,
      z.string().default('.graveshift/credentials.json'),
    ),
    // No hardcoded secret. Boot fails in every environment when this key is absent.
    GRAVESHIFT_OAUTH_JWT_SECRET: z.preprocess(
      emptyToUndefined,
      z
        .string({
          error: 'GRAVESHIFT_OAUTH_JWT_SECRET must be set to at least 32 characters',
        })
        .min(32, 'GRAVESHIFT_OAUTH_JWT_SECRET must be set to at least 32 characters')
        .refine(
          (value) => !value.startsWith('replace-with'),
          'GRAVESHIFT_OAUTH_JWT_SECRET is still the example placeholder',
        ),
    ),
    GRAVESHIFT_OAUTH_ISSUER: z.preprocess(emptyToUndefined, z.string().default('graveshift-api')),
    GRAVESHIFT_OAUTH_AUDIENCE: z.preprocess(
      emptyToUndefined,
      z.string().default('graveshift-credentials'),
    ),
    GRAVESHIFT_OAUTH_CLIENTS: z.preprocess((value) => {
      const text = emptyToUndefined(value);
      if (typeof text !== 'string') return text;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    }, z.record(z.string(), oauthClientSchema).default(oauthClientsDefault)),
    GRAVESHIFT_CREDENTIAL_TTL_SECONDS: z.coerce.number().int().min(60).default(86_400),
    GRAVESHIFT_CREDENTIAL_MAX_TTL_SECONDS: z.coerce.number().int().min(60).default(2_592_000),
    GRAVESHIFT_EVENT_MAX_BYTES: z.coerce.number().int().min(1024).max(102_400).default(65_536),
    GRAVESHIFT_EVENT_RATE_LIMIT: z.coerce.number().int().min(1).default(60),
    GRAVESHIFT_EVENT_RATE_TTL_MS: z.coerce.number().int().min(1000).default(60_000),
    GRAVESHIFT_NATS_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
    GRAVESHIFT_NATS_STREAM: z.preprocess(emptyToUndefined, z.string().default('GRAVESHIFT_EVENTS')),
  })
  .loose();

export type Env = z.infer<typeof envSchema>;
export type OAuthClientConfig = z.infer<typeof oauthClientSchema>;
