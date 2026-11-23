import { isIP } from 'node:net';
import { GatewayConfigSchema } from '@graveshift/gateway/config';
import { ModeSchema } from '@graveshift/policy';
import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const setting = <Schema extends z.ZodType>(schema: Schema) =>
  z.preprocess(emptyToUndefined, schema);
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const host = z
  .string()
  .refine(
    (value) => isIP(value) !== 0 || /^(?=.{1,253}$)[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$/.test(value),
    'Host must be an IP address or a host name',
  );
const secret = (key: string) =>
  z
    .string({ error: `${key} must be set to at least 32 characters` })
    .min(32, `${key} must be set to at least 32 characters`)
    .refine(
      (value) => !/replace[-_ ]?with|change[-_ ]?me|example|placeholder/i.test(value),
      `${key} is still an example placeholder`,
    );
const internalUrl = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = URL.parse(value);
  return (
    url !== null &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === '/'
  );
}, 'Internal URL must be an HTTP origin without credentials');

function parseJson(value: unknown): unknown {
  const input = emptyToUndefined(value);
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return input;
  }
}

function isLocalHost(value: string): boolean {
  return (
    value === 'localhost' || value === '[::1]' || (isIP(value) === 4 && value.startsWith('127.'))
  );
}

function isPrivateHost(value: string): boolean {
  if (isIP(value) === 4) return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value);
  return /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(value) && value !== 'localhost';
}

export const rootEnvSchema = z
  .object({
    NODE_ENV: setting(z.enum(['development', 'production', 'test']).default('development')),
    HOST: setting(host.default('127.0.0.1')),
    PORT: setting(z.coerce.number().int().min(1).max(65_535).default(3000)),
    DATABASE_URL: setting(
      z.url({ protocol: /^postgres(ql)?$/ }).refine(
        (value) => {
          const url = URL.parse(value);
          return url !== null && url.hostname !== '' && url.pathname.length > 1;
        },
        {
          message: 'DATABASE_URL must use PostgreSQL',
        },
      ),
    ),
    GRAVESHIFT_ROOT_ADMIN_EMAIL: setting(z.email().optional()),
    GRAVESHIFT_ROOT_ADMIN_PASSWORD: setting(z.string().min(12).optional()),
    GRAVESHIFT_ROOT_ORG_NAME: setting(z.string().min(1).optional()),
    GRAVESHIFT_ROOT_ORG_SLUG: setting(slug.optional()),
    GRAVESHIFT_API_INTERNAL_TOKEN: setting(
      secret('GRAVESHIFT_API_INTERNAL_TOKEN').regex(
        /^[A-Za-z0-9._~+/-]+=*$/,
        'Internal token must be a bearer token',
      ),
    ),
    GRAVESHIFT_DAEMON_INTERNAL_TOKEN: setting(
      secret('GRAVESHIFT_DAEMON_INTERNAL_TOKEN').regex(
        /^[A-Za-z0-9._~+/-]+=*$/,
        'Internal token must be a bearer token',
      ),
    ),
    GRAVESHIFT_API_URL: setting(internalUrl.default('http://127.0.0.1:3000')),
    GRAVESHIFT_DAEMON_URL: setting(internalUrl.default('http://127.0.0.1:2602')),
    GRAVESHIFT_PRIVATE_HOST: setting(host.optional()),
    GRAVESHIFT_NATS_URL: setting(
      z
        .url({ protocol: /^(nats|tls|ws|wss)$/ })
        .refine((value) => Boolean(URL.parse(value)?.hostname), 'NATS URL must include a host')
        .optional(),
    ),
    GRAVESHIFT_NATS_STREAM: setting(
      z
        .string()
        .regex(/^[A-Za-z0-9_-]+$/)
        .default('GRAVESHIFT_EVENTS'),
    ),
    GRAVESHIFT_MODE: setting(ModeSchema.optional()),
    GRAVESHIFT_GATEWAY_CONFIG: z.preprocess(
      parseJson,
      GatewayConfigSchema.default({
        globalDailyBudgetUsd: 0,
        maxRetries: 1,
        timeoutMs: 30_000,
        priceTableUsdPer1M: {},
      }),
    ),
    GRAVESHIFT_OAUTH_JWT_SECRET: setting(secret('GRAVESHIFT_OAUTH_JWT_SECRET')),
    GRAVESHIFT_OAUTH_ISSUER: setting(z.string().min(1).default('graveshift-api')),
    GRAVESHIFT_OAUTH_AUDIENCE: setting(z.string().min(1).default('graveshift-credentials')),
    GRAVESHIFT_CREDENTIAL_TTL_SECONDS: setting(z.coerce.number().int().min(60).default(86_400)),
    GRAVESHIFT_CREDENTIAL_MAX_TTL_SECONDS: setting(
      z.coerce.number().int().min(60).default(2_592_000),
    ),
    GRAVESHIFT_EVENT_MAX_BYTES: setting(
      z.coerce.number().int().min(1024).max(102_400).default(65_536),
    ),
    GRAVESHIFT_EVENT_RATE_LIMIT: setting(z.coerce.number().int().min(1).default(60)),
    GRAVESHIFT_EVENT_RATE_TTL_MS: setting(z.coerce.number().int().min(1000).default(60_000)),
  })
  .superRefine((env, context) => {
    const rootKeys = [
      env.GRAVESHIFT_ROOT_ADMIN_EMAIL,
      env.GRAVESHIFT_ROOT_ADMIN_PASSWORD,
      env.GRAVESHIFT_ROOT_ORG_NAME,
      env.GRAVESHIFT_ROOT_ORG_SLUG,
    ];
    if (
      rootKeys.some((value) => value !== undefined) &&
      rootKeys.some((value) => value === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['GRAVESHIFT_ROOT_ADMIN_EMAIL'],
        message: 'All four root admin and root organization keys must be set together',
      });
    }
    if (env.GRAVESHIFT_API_INTERNAL_TOKEN === env.GRAVESHIFT_DAEMON_INTERNAL_TOKEN) {
      context.addIssue({
        code: 'custom',
        path: ['GRAVESHIFT_DAEMON_INTERNAL_TOKEN'],
        message: 'The API and daemon internal tokens must differ',
      });
    }
    for (const key of ['GRAVESHIFT_API_URL', 'GRAVESHIFT_DAEMON_URL'] as const) {
      const hostname = URL.parse(env[key])?.hostname;
      if (hostname === undefined) continue;
      if (
        !isLocalHost(hostname) &&
        !(hostname === env.GRAVESHIFT_PRIVATE_HOST && isPrivateHost(hostname))
      ) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Internal URL must stay on the local host or the configured private host',
        });
      }
    }
  });

export type RootEnv = z.infer<typeof rootEnvSchema>;
