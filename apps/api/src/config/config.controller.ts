import { AgentsFileSchema, type AgentsFile } from '@graveshift/agents';
import type { GraveshiftConfig } from '@graveshift/config';
import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
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

export type ConfigExportedPart = 'agents' | 'policy';

// Read-only view of the config validated at boot (ADR 0015). No route reads a YAML
// file and there is no write route. The validated blocks hold no secret value:
// apiKeyEnv, appIdEnv and privateKeyEnv name environment variables, and the API
// never resolves them here. The dashboard is owned by another frontend engineer;
// this repo ships the contract and these endpoint definitions only.
@ApiTags('config')
@ApiBearerAuth()
@Controller('api/config')
export class ConfigController {
  constructor(
    @Inject(GRAVESHIFT_CONFIG) private readonly config: GraveshiftConfig,
    private readonly audit: AuditRepo,
  ) {}

  // The guards run before any parsing: an anonymous call is denied with 401 before a
  // config value is read, and a token without the route scope is denied with 403.
  @Get('agents')
  @UseGuards(AuthGuard('oauth-client-access'), ConfigScopeGuard)
  @RequiresScope(CONFIG_READ_SCOPE)
  @ApiOkResponse({
    description: 'The sanitized Agent view from boot, for the dashboard. Requires config:read.',
    standardSchema: ConfigAgentsViewSchema,
  })
  @ApiUnauthorizedResponse({ description: 'No valid bearer credential was presented.' })
  @ApiForbiddenResponse({ description: 'The token does not hold config:read.' })
  getAgents(): ConfigAgentsView {
    return toConfigAgentsView(this.config.agents);
  }

  @Get('policy')
  @UseGuards(AuthGuard('oauth-client-access'), ConfigScopeGuard)
  @RequiresScope(CONFIG_READ_SCOPE)
  @ApiOkResponse({
    description:
      'The sanitized policy view from boot, for the dashboard. No approver id, repo name, ' +
      'branch name or allowed/forbidden path. Requires config:read.',
    standardSchema: ConfigPolicyViewSchema,
  })
  @ApiUnauthorizedResponse({ description: 'No valid bearer credential was presented.' })
  @ApiForbiddenResponse({ description: 'The token does not hold config:read.' })
  getPolicy(): ConfigPolicyView {
    return toConfigPolicyView(this.config.policy);
  }

  @Get('agents/export')
  @UseGuards(AuthGuard('oauth-client-access'), ConfigScopeGuard)
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
  @UseGuards(AuthGuard('oauth-client-access'), ConfigScopeGuard)
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

  // Exactly one audit entry per export, with identifiers only: the project and which
  // block was exported. No config content enters the payload. If the append fails, the
  // request fails closed: no config is served before the entry is written.
  private recordExport(actor: Principal, exported: ConfigExportedPart): Promise<unknown> {
    return this.audit.append({
      projectId: actor.projectId,
      actor: actor.clientId,
      type: 'config.exported',
      payload: { exported },
    });
  }
}
