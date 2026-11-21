import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { EVENT_PUBLISHER } from './auth.types';
import { CredentialCoreModule } from './credential-core.module';
import { CredentialsController } from './controllers/credentials.controller';
import { EventsController } from './controllers/events.controller';
import { OAuthController } from './controllers/oauth.controller';
import { OAuthClientCredentialsStrategy } from './oauth-client-credentials.strategy';
import { PluginApiKeyGuard } from './plugin-api-key.guard';
import { EventIngestService } from './services/event-ingest.service';
import { NatsEventPublisher } from './services/nats-event-publisher';
import { OAuthTokenService } from './services/oauth-token.service';

@Module({
  imports: [PassportModule, JwtModule.register({}), CredentialCoreModule],
  controllers: [CredentialsController, EventsController, OAuthController],
  providers: [
    EventIngestService,
    OAuthTokenService,
    PluginApiKeyGuard,
    OAuthClientCredentialsStrategy,
    { provide: EVENT_PUBLISHER, useClass: NatsEventPublisher },
  ],
})
export class AuthModule {}
