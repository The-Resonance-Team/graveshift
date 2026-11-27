import { Module } from '@nestjs/common';
import { connectNatsPublisher } from '@graveshift/events/nats';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { DeploysModule } from '../deploys/deploys.module';
import { EVENT_PUBLISHER, NATS_CONNECTOR } from './auth.types';
import { CredentialCoreModule } from './credential-core.module';
import { CredentialsController } from './controllers/credentials.controller';
import { EventsController } from './controllers/events.controller';
import { OAuthController } from './controllers/oauth.controller';
import {
  SentryEventsController,
  SentryHttpExceptionFilter,
} from './controllers/sentry-events.controller';
import { OAuthClientAccessStrategy } from './oauth-client-access.strategy';
import { OAuthClientCredentialsStrategy } from './oauth-client-credentials.strategy';
import { PluginApiKeyGuard } from './plugin-api-key.guard';
import { SentryKeyGuard } from './sentry-key.guard';
import { EventIngestService } from './services/event-ingest.service';
import { NatsEventPublisher } from './services/nats-event-publisher';
import { OAuthTokenService } from './services/oauth-token.service';
import { SentryIngestService } from './services/sentry-ingest.service';

@Module({
  imports: [PassportModule, JwtModule.register({}), CredentialCoreModule, DeploysModule],
  controllers: [CredentialsController, EventsController, OAuthController, SentryEventsController],
  providers: [
    EventIngestService,
    SentryIngestService,
    OAuthTokenService,
    PluginApiKeyGuard,
    SentryKeyGuard,
    SentryHttpExceptionFilter,
    OAuthClientCredentialsStrategy,
    OAuthClientAccessStrategy,
    { provide: NATS_CONNECTOR, useValue: connectNatsPublisher },
    { provide: EVENT_PUBLISHER, useClass: NatsEventPublisher },
  ],
})
export class AuthModule {}
