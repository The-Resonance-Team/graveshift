import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { HealthController } from './health.controller';
import { AuditModule } from './audit/audit.module';
import { AuthConfigModule } from './auth/auth.config.module';
import { ConfigController } from './config/config.controller';
import { GraveshiftConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { CREDENTIAL_CONFIG, type AuthConfig } from './auth/auth.types';
import { CredentialCoreModule } from './auth/credential-core.module';
import { envSchema } from './auth/env.schema';
import { PrismaInfraModule } from './infra/prisma.module';
import { ThrottleKeyGenerator } from './auth/throttle-key.generator';
import { ThrottleKeyModule } from './auth/throttle-key.module';
import { EventsConfigModule } from './mcp/events/events.config';
import { GraveshiftMcpModule } from './mcp/mcp.module';
import { RulesController } from './rules.controller';
import { WorkItemsModule } from './work-items/work-items.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    GraveshiftConfigModule,
    PrismaInfraModule,
    AuditModule,
    AuthConfigModule,
    EventsConfigModule,
    CredentialCoreModule,
    ThrottleKeyModule,
    ThrottlerModule.forRootAsync({
      imports: [],
      inject: [CREDENTIAL_CONFIG, ThrottleKeyGenerator],
      useFactory: (config: AuthConfig, keyGenerator: ThrottleKeyGenerator) => ({
        throttlers: [{ ttl: config.eventRateTtlMs, limit: config.eventRateLimit }],
        generateKey: (context: Parameters<ThrottleKeyGenerator['generate']>[0]) =>
          keyGenerator.generate(context),
      }),
    }),
    GraveshiftMcpModule,
    WorkItemsModule,
    AuthModule,
  ],
  controllers: [HealthController, RulesController, ConfigController],
})
export class AppModule {}
