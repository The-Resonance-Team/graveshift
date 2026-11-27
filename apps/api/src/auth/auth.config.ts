import type { ConfigService } from '@nestjs/config';

import type { RootEnv } from '../config/env.schema';
import type { AuthConfig } from './auth.types';

export function createAuthConfig(config: ConfigService<RootEnv, true>): AuthConfig {
  return {
    jwtSecret: config.getOrThrow<string>('GRAVESHIFT_OAUTH_JWT_SECRET'),
    jwtIssuer: config.getOrThrow<string>('GRAVESHIFT_OAUTH_ISSUER'),
    jwtAudience: config.getOrThrow<string>('GRAVESHIFT_OAUTH_AUDIENCE'),
    defaultTtlSeconds: config.getOrThrow<number>('GRAVESHIFT_CREDENTIAL_TTL_SECONDS'),
    maxTtlSeconds: config.getOrThrow<number>('GRAVESHIFT_CREDENTIAL_MAX_TTL_SECONDS'),
    maxEventBytes: config.getOrThrow<number>('GRAVESHIFT_EVENT_MAX_BYTES'),
    eventRateLimit: config.getOrThrow<number>('GRAVESHIFT_EVENT_RATE_LIMIT'),
    eventRateTtlMs: config.getOrThrow<number>('GRAVESHIFT_EVENT_RATE_TTL_MS'),
  };
}
