import { Global, Module, UseGuards } from '@nestjs/common';
import { McpModule } from '@nestjs/mcp';
import { ApiExcludeController } from '@nestjs/swagger';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { GraveshiftConfig } from '@graveshift/config';
import type { Policy } from '@graveshift/policy';

import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { BOOT_CONFIG, type RootBootConfig } from '../config/boot.config';
import { GRAVESHIFT_CONFIG } from '../config/config.provider';
import { DeployRepo } from '../deploys/deploy.repo';
import { DeploysModule } from '../deploys/deploys.module';
import { DaemonReadClientModule, DaemonReadConfigModule } from './daemon-read.config';
import { EventsBridge } from './events/events.bridge';
import { EventPollService } from './events/events.service';
import { NatsEventSource } from './events/events.source';
import { CLOSED_DEPLOYMENTS, MCP_EVENT_SOURCE } from './events/events.types';
import { HttpMcpBackend } from './mcp.backend';
import { McpPrompts } from './mcp.prompts';
import { McpResources } from './mcp.resources';
import { McpHttpScopeGuard } from './mcp-http-scope.guard';
import { McpBearerGuard, McpTokenVerifierService } from './mcp-token.verifier';
import { McpProjectContext } from './mcp-project-context';
import { MCP_AUDIT_WRITER, MCP_BACKEND, MCP_ENV_MODE, MCP_POLICY } from './mcp.types';
import { McpTools } from './mcp.tools';

/** The authenticated Project is shared by the feature module and the MCP module guards. */
@Global()
@Module({ providers: [McpProjectContext], exports: [McpProjectContext] })
export class McpProjectContextModule {}

/** The MCP primitives. Kept separate so tests can override the backend and policy. */
@Module({
  imports: [
    McpProjectContextModule,
    AuthModule,
    DeploysModule,
    ThrottlerModule,
    AuditModule,
    DaemonReadConfigModule,
    DaemonReadClientModule,
  ],
  providers: [
    McpTools,
    McpPrompts,
    McpResources,
    McpTokenVerifierService,
    McpBearerGuard,
    EventPollService,
    EventsBridge,
    { provide: MCP_EVENT_SOURCE, useClass: NatsEventSource },
    { provide: CLOSED_DEPLOYMENTS, useExisting: DeployRepo },
    { provide: MCP_BACKEND, useClass: HttpMcpBackend },
    { provide: MCP_AUDIT_WRITER, useExisting: MCP_BACKEND },
    {
      provide: MCP_POLICY,
      useFactory: (config: GraveshiftConfig): Policy => config.policy,
      inject: [GRAVESHIFT_CONFIG],
    },
    {
      provide: MCP_ENV_MODE,
      inject: [BOOT_CONFIG],
      useFactory: (config: RootBootConfig) => config.mode,
    },
  ],
  exports: [
    MCP_BACKEND,
    MCP_AUDIT_WRITER,
    MCP_POLICY,
    MCP_ENV_MODE,
    McpTokenVerifierService,
    McpBearerGuard,
  ],
})
export class McpFeatureModule {}

@Module({
  imports: [
    McpFeatureModule,
    McpModule.forRoot({
      name: 'graveshift-mcp',
      version: '0.1.0',
      instructions:
        'Read incidents, diagnoses and the audit log before proposing a fix. propose_fix never executes an action.',
      include: [McpFeatureModule],
      decorators: [
        ApiExcludeController(),
        UseGuards(ThrottlerGuard, McpBearerGuard, McpHttpScopeGuard),
      ],
    }),
  ],
})
export class GraveshiftMcpModule {}
