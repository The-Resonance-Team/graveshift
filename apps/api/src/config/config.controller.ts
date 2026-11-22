import { AgentsFileSchema, type AgentsFile } from '@graveshift/agents';
import { GraveshiftConfigSchema, type GraveshiftConfig } from '@graveshift/config';
import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PolicySchema, type Policy } from '@graveshift/policy';

import type { Principal, PrincipalRequest } from '../auth/auth.types';
import { CONFIG_EXPORT_SCOPE, CONFIG_READ_SCOPE } from '../auth/scopes';
import { AuditRepo } from '../audit/repo/audit.repo';

import { ConfigScopeGuard, RequiresScope } from './config-scope.guard';
import { GRAVESHIFT_CONFIG } from './config.provider';
import {
  ConfigAgentsViewSchema,
  ConfigPolicyViewSchema,
  toConfigAgentsView,
  toConfigPolicyView,
  type ConfigAgentsView,
  type ConfigPolicyView,
} from './config.schema';

export type ConfigExportedPart = 'agents' | 'policy' | 'config';

// Read-only view of the config validated at boot (ADR 0015). No route reads a YAML
// file and there is no write route. The validated blocks hold no secret value:
// apiKeyEnv, appIdEnv and privateKeyEnv name environment variables, and the API
// never resolves them here. The dashboard is owned by another frontend engineer;
// this repo ships the contract and these endpoint definitions only.
// ThrottlerGuard runs first on every route: an export takes a serialized audit
// transaction, so the surface needs a rate limit before it reaches the handler.
@ApiTags('config')
@ApiBearerAuth()
@UseGuards(ThrottlerGuard, AuthGuard('oauth-client-access'), ConfigScopeGuard)
@ApiTooManyRequestsResponse({ description: 'The client exceeded the rate limit.' })
@Controller('api/config')
export class ConfigController {
  constructor(
    @Inject(GRAVESHIFT_CONFIG) private readonly config: GraveshiftConfig,
    private readonly audit: AuditRepo,
  ) {}

  // The guards run before any parsing: an anonymous call is denied with 401 before a
  // config value is read, and a token without the route scope is denied with 403.
  @Get('agents')
  @RequiresScope(CONFIG_READ_SCOPE)
  @ApiOkResponse({
    description:
      'The sanitized Agent view from boot, for the dashboard. Param names only, no values. ' +
      'Requires config:read.',
    standardSchema: ConfigAgentsViewSchema,
  })
  @ApiUnauthorizedResponse({ description: 'No valid bearer credential was presented.' })
  @ApiForbiddenResponse({ description: 'The token does not hold config:read.' })
  getAgents(): ConfigAgentsView {
    return toConfigAgentsView(this.config.agents);
  }

  @Get('policy')
  @RequiresScope(CONFIG_READ_SCOPE)
  @ApiOkResponse({
    description:
      'The sanitized policy view from boot, for the dashboard. No approver id, repo name, ' +
      'branch name, allowed or forbidden path, rule condition or replica bound. ' +
      'Requires config:read.',
    standardSchema: ConfigPolicyViewSchema,
  })
  @ApiUnauthorizedResponse({ description: 'No valid bearer credential was presented.' })
  @ApiForbiddenResponse({ description: 'The token does not hold config:read.' })
  getPolicy(): ConfigPolicyView {
    return toConfigPolicyView(this.config.policy);
  }

  @Get('agents/export')
  @RequiresScope(CONFIG_EXPORT_SCOPE)
  @ApiOkResponse({
    description:
      'The full validated Agent config from boot. apiKeyEnv is a variable name only. ' +
      'Writes exactly one config.exported audit entry. Requires config:export.',
    standardSchema: AgentsFileSchema,
  })
  @ApiUnauthorizedResponse({ description: 'No valid bearer credential was presented.' })
  @ApiForbiddenResponse({ description: 'The token does not hold config:export.' })
  async exportAgents(@Req() request: PrincipalRequest): Promise<AgentsFile> {
    await this.recordExport(request.user, 'agents');
    return this.config.agents;
  }

  @Get('policy/export')
  @RequiresScope(CONFIG_EXPORT_SCOPE)
  @ApiOkResponse({
    description:
      'The full validated policy config from boot. No secret value or resolved env value. ' +
      'Writes exactly one config.exported audit entry. Requires config:export.',
    standardSchema: PolicySchema,
  })
  @ApiUnauthorizedResponse({ description: 'No valid bearer credential was presented.' })
  @ApiForbiddenResponse({ description: 'The token does not hold config:export.' })
  async exportPolicy(@Req() request: PrincipalRequest): Promise<Policy> {
    await this.recordExport(request.user, 'policy');
    return this.config.policy;
  }

  // The whole validated config in one call: boot, agents, policy and fix. A caller that
  // needs every block makes this one request instead of one request per block.
  @Get('export')
  @RequiresScope(CONFIG_EXPORT_SCOPE)
  @ApiOkResponse({
    description:
      'The whole validated config from boot: boot, agents, policy and fix. apiKeyEnv, ' +
      'appIdEnv and privateKeyEnv stay variable names, and no environment value is ' +
      'resolved. Writes exactly one config.exported audit entry. Requires config:export.',
    standardSchema: GraveshiftConfigSchema,
  })
  @ApiUnauthorizedResponse({ description: 'No valid bearer credential was presented.' })
  @ApiForbiddenResponse({ description: 'The token does not hold config:export.' })
  async exportConfig(@Req() request: PrincipalRequest): Promise<GraveshiftConfig> {
    await this.recordExport(request.user, 'config');
    return this.config;
  }

  // Exactly one audit entry per export, with identifiers only: the entry carries the
  // project and the actor, and the payload holds which part was exported. No config
  // content enters the payload. If the append fails, the request fails closed: no
  // config is served before the entry is written.
  private recordExport(actor: Principal, exported: ConfigExportedPart): Promise<unknown> {
    return this.audit.append({
      projectId: actor.projectId,
      actor: actor.clientId,
      type: 'config.exported',
      payload: { exported },
    });
  }
}
