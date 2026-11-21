import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { EVENT_PUBLISHER } from './auth.types';
import { CredentialCoreModule } from './credential-core.module';
import { CredentialsController } from './controllers/credentials.controller';
import { EventsController } from './controllers/events.controller';
import { PluginApiKeyGuard } from './guards/plugin-api-key.guard';
import { EventIngestService } from './services/event-ingest.service';
import { NatsEventPublisher } from './services/nats-event-publisher';
import { OAuthClientCredentialsStrategy } from './strategies/oauth-client-credentials.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), CredentialCoreModule],
  controllers: [CredentialsController, EventsController],
  providers: [
    EventIngestService,
    PluginApiKeyGuard,
    OAuthClientCredentialsStrategy,
    { provide: EVENT_PUBLISHER, useClass: NatsEventPublisher },
  ],
})
export class AuthModule {}
