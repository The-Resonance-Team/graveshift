import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpClientModule } from '@nestjs/http-client';
import { ThrottlerModule } from '@nestjs/throttler';

import { HealthController } from './health.controller';
import { ActionsModule } from './actions/actions.module';
import { DeploysModule } from './deploys/deploys.module';
import { DeployAuthModule } from './deploys/deploy-auth.module';
import { AuditModule } from './audit/audit.module';
import { AuthConfigModule } from './auth/auth.config.module';
import { envSchema } from './auth/env.schema';
import { AuthModule } from './auth/auth.module';
import { CREDENTIAL_CONFIG, type AuthConfig } from './auth/auth.types';
import { CredentialCoreModule } from './auth/credential-core.module';
import { ThrottleKeyGenerator } from './auth/throttle-key.generator';
import { ThrottleKeyModule } from './auth/throttle-key.module';
import { ConfigController } from './config/config.controller';
import { GraveshiftConfigModule, RootConfigModule } from './config/config.module';
import { HauntingsModule } from './hauntings/hauntings.module';
import { InternalAccessModule } from './internal/internal.module';
import { InternalHttpModule } from './internal/internal-http.module';
import { IdentityModule } from './identity/identity.module';
import { InternalConfigController } from './internal/internal-config.controller';
import { PolicyContextController } from './internal/policy-context.controller';
import { PolicyContextService } from './internal/policy-context.service';
import { PrismaInfraModule } from './infra/prisma.module';
import { EventsConfigModule } from './mcp/events/events.config';
import { GraveshiftMcpModule } from './mcp/mcp.module';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { WorkItemsModule } from './work-items/work-items.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    GraveshiftConfigModule,
    RootConfigModule,
    AuthConfigModule,
    HttpClientModule.forRoot({ retry: false, timeout: 30_000 }),
    PrismaInfraModule,
    InternalAccessModule,
    InternalHttpModule,
    IdentityModule,
    DeployAuthModule,
    DeploysModule,
    AuditModule,
    ActionsModule,
    HauntingsModule,
    EventsConfigModule,
    CredentialCoreModule,
    ThrottleKeyModule,
    ThrottlerModule.forRootAsync({
      imports: [],
      inject: [CREDENTIAL_CONFIG, ThrottleKeyGenerator],
      useFactory: (config: AuthConfig, keyGenerator: ThrottleKeyGenerator) => ({
        throttlers: [{ ttl: config.eventRateTtlMs, limit: config.eventRateLimit }],
        getTracker: (request: Parameters<ThrottleKeyGenerator['track']>[0]) =>
          keyGenerator.track(request),
        generateKey: (context: Parameters<ThrottleKeyGenerator['generate']>[0], tracker: string) =>
          keyGenerator.generate(context, tracker),
      }),
    }),
    GraveshiftMcpModule,
    WorkItemsModule,
    AuthModule,
  ],
  controllers: [
    HealthController,
    RulesController,
    ConfigController,
    InternalConfigController,
    PolicyContextController,
  ],
  providers: [RulesService, PolicyContextService],
})
export class AppModule {}
