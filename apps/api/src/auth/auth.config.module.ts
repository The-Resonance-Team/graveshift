import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CREDENTIAL_CONFIG, type AuthConfig } from './auth.types';
import type { OAuthClientConfig } from './env.schema';

export function createAuthConfig(config: ConfigService): AuthConfig {
  return {
    credentialsPath: config.getOrThrow<string>('GRAVESHIFT_CREDENTIALS_PATH'),
    jwtSecret: config.getOrThrow<string>('GRAVESHIFT_OAUTH_JWT_SECRET'),
    jwtIssuer: config.getOrThrow<string>('GRAVESHIFT_OAUTH_ISSUER'),
    jwtAudience: config.getOrThrow<string>('GRAVESHIFT_OAUTH_AUDIENCE'),
    defaultTtlSeconds: config.getOrThrow<number>('GRAVESHIFT_CREDENTIAL_TTL_SECONDS'),
    maxTtlSeconds: config.getOrThrow<number>('GRAVESHIFT_CREDENTIAL_MAX_TTL_SECONDS'),
    maxEventBytes: config.getOrThrow<number>('GRAVESHIFT_EVENT_MAX_BYTES'),
    eventRateLimit: config.getOrThrow<number>('GRAVESHIFT_EVENT_RATE_LIMIT'),
    eventRateTtlMs: config.getOrThrow<number>('GRAVESHIFT_EVENT_RATE_TTL_MS'),
    oauthClients: config.getOrThrow<Record<string, OAuthClientConfig>>('GRAVESHIFT_OAUTH_CLIENTS'),
    natsUrl: config.get<string>('GRAVESHIFT_NATS_URL'),
    natsStream: config.get<string>('GRAVESHIFT_NATS_STREAM'),
  };
}

@Global()
@Module({
  providers: [
    {
      provide: CREDENTIAL_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AuthConfig => createAuthConfig(config),
    },
  ],
  exports: [CREDENTIAL_CONFIG],
})
export class AuthConfigModule {}
