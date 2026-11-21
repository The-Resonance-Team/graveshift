import { Module, UseGuards } from '@nestjs/common';
import { McpModule } from '@nestjs/mcp';
import { ApiExcludeController } from '@nestjs/swagger';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadPolicy, parsePolicy, type Policy } from '@graveshift/policy';

import { AuthModule } from '../auth/auth.module';
import { EventsBridge } from './events/events.bridge';
import { EventPollService } from './events/events.service';
import { NatsEventSource } from './events/events.source';
import { MCP_EVENT_SOURCE } from './events/events.types';
import { UnavailableMcpBackend } from './mcp.backend';
import { McpPrompts } from './mcp.prompts';
import { McpResources } from './mcp.resources';
import { McpHttpScopeGuard } from './mcp-http-scope.guard';
import { McpBearerGuard, McpTokenVerifierService } from './mcp-token.verifier';
import { MCP_BACKEND, MCP_ENV_MODE, MCP_POLICY } from './mcp.types';
import { McpTools } from './mcp.tools';

const DEFAULT_POLICY: Policy = parsePolicy({
  version: 1,
  mode: 'propose',
  approvers: { discordUserIds: [], discordRoleIds: [] },
  limits: {
    maxOpenPrsPerHour: 0,
    maxActionsPerServicePer10Min: 0,
    maxDiagnosisLoops: 0,
    llmDailyBudgetUsd: 0,
  },
  llm: { minConfidenceForPr: 1, minConfidenceForAction: 1 },
  github: { repos: [] },
  rules: [],
  default: 'deny',
});

/** The MCP primitives. Kept separate so tests can override the backend and policy. */
@Module({
  imports: [AuthModule, ThrottlerModule],
  providers: [
    McpTools,
    McpPrompts,
    McpResources,
    McpTokenVerifierService,
    McpBearerGuard,
    EventPollService,
    EventsBridge,
    { provide: MCP_EVENT_SOURCE, useClass: NatsEventSource },
    { provide: MCP_BACKEND, useClass: UnavailableMcpBackend },
    {
      provide: MCP_POLICY,
      useFactory: async (): Promise<Policy> => {
        const path = process.env.POLICY_PATH;
        return path ? loadPolicy(path) : DEFAULT_POLICY;
      },
    },
    { provide: MCP_ENV_MODE, useFactory: () => process.env.GRAVESHIFT_MODE },
  ],
  exports: [MCP_BACKEND, MCP_POLICY, MCP_ENV_MODE, McpTokenVerifierService, McpBearerGuard],
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
