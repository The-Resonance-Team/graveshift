import { Module } from '@nestjs/common';
import { McpModule } from '@nestjs/mcp';
import { ApiExcludeController } from '@nestjs/swagger';
import { loadPolicy, parsePolicy, type Policy } from '@graveshift/policy';

import { UnavailableMcpBackend } from './mcp.backend';
import { McpPrompts } from './mcp.prompts';
import { McpResources } from './mcp.resources';
import { McpTokenVerifierService, MCP_RESOURCE } from './mcp-token.verifier';
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
  providers: [
    McpTools,
    McpPrompts,
    McpResources,
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
  exports: [MCP_BACKEND, MCP_POLICY, MCP_ENV_MODE],
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
      decorators: [ApiExcludeController()],
      auth: {
        verifier: McpTokenVerifierService,
        resource: MCP_RESOURCE,
        authorizationServers: [MCP_RESOURCE],
      },
    }),
  ],
})
export class GraveshiftMcpModule {}
