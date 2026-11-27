import { Data, Effect } from 'effect';
import { z } from 'zod';
import { parseDaemonEnv } from './env';

export const DEFAULT_PORT = 2602;

export class InvalidPort extends Data.TaggedError('InvalidPort')<{
  readonly value: string;
  readonly message: string;
}> {}

export const parsePort = (raw: string | undefined): Effect.Effect<number, InvalidPort> => {
  const value = raw ?? String(DEFAULT_PORT);
  const fail = () => Effect.fail(new InvalidPort({ value, message: `Invalid PORT: ${value}` }));
  if (!/^\d+$/.test(value)) return fail();
  const port = Number(value);
  if (port < 1 || port > 65535) return fail();
  return Effect.succeed(port);
};

export const InternalOriginSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === '/'
  );
}, 'A private loopback HTTP origin is required');

const InternalTokenSchema = z
  .string()
  .min(32)
  .regex(/^[A-Za-z0-9._~+/-]+=*$/)
  .refine((value) => !/replace[-_ ]?with|change[-_ ]?me|example|placeholder/i.test(value));

export const DaemonEnvSchema = z
  .object({
    GRAVESHIFT_API_INTERNAL_TOKEN: InternalTokenSchema,
    GRAVESHIFT_DAEMON_INTERNAL_TOKEN: InternalTokenSchema,
    GRAVESHIFT_API_URL: InternalOriginSchema.default('http://127.0.0.1:3000'),
    GRAVESHIFT_DAEMON_URL: InternalOriginSchema.default('http://127.0.0.1:2602'),
    GRAVESHIFT_NATS_URL: z
      .url()
      .refine((value) => /^(nats|tls):$/.test(new URL(value).protocol))
      .default('nats://127.0.0.1:4222'),
    GRAVESHIFT_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900_000).default(180_000),
    GRAVESHIFT_API_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(10_000),
    GRAVESHIFT_BODY_MAX_BYTES: z.coerce.number().int().min(1024).max(1_048_576).default(65_536),
  })
  .refine((env) => env.GRAVESHIFT_API_INTERNAL_TOKEN !== env.GRAVESHIFT_DAEMON_INTERNAL_TOKEN, {
    error: 'The API and daemon internal tokens must differ',
    path: ['GRAVESHIFT_DAEMON_INTERNAL_TOKEN'],
  });
export type DaemonConfig = z.infer<typeof DaemonEnvSchema>;

export function readDaemonConfig(env: Record<string, string | undefined>): DaemonConfig {
  return parseDaemonEnv(DaemonEnvSchema, env, 'Daemon configuration is invalid');
}
