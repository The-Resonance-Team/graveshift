import { Module, type ExecutionContext } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { HealthController } from './health.controller';
import { AuthConfigModule } from './auth/auth.config.module';
import { AuthModule } from './auth/auth.module';
import { CredentialCoreModule } from './auth/credential-core.module';
import { CREDENTIAL_CONFIG, type AuthConfig, type PrincipalRequest } from './auth/auth.types';
import { envSchema } from './auth/env.schema';
import { GraveshiftMcpModule } from './mcp/mcp.module';
import { RulesController } from './rules.controller';
import { WorkItemsModule } from './work-items/work-items.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    AuthConfigModule,
    CredentialCoreModule,
    ThrottlerModule.forRootAsync({
      imports: [],
      inject: [CREDENTIAL_CONFIG],
      useFactory: (config: AuthConfig) => ({
        throttlers: [{ ttl: config.eventRateTtlMs, limit: config.eventRateLimit }],
        generateKey: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest<PrincipalRequest & { ip?: string }>();
          return request.pluginPrincipal?.id ?? request.ip ?? 'anonymous';
        },
      }),
    }),
    GraveshiftMcpModule,
    WorkItemsModule,
    AuthModule,
  ],
  controllers: [HealthController, RulesController],
})
export class AppModule {}
