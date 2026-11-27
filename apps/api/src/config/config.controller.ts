import { randomUUID } from 'node:crypto';

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

import type { Principal, PrincipalRequest } from '../auth/auth.types';
import { AUDIT_SINK, type AuditSink } from '../audit/audit.sink';

import { GRAVESHIFT_CONFIG } from './config.provider';

// The config API has one endpoint. It serves the whole config validated at boot (ADR
// 0015) from the one injected boot provider; no route reads a YAML file and no write
// route exists. The validated config holds no secret value: apiKeyEnv, appIdEnv and
// privateKeyEnv name environment variables, and the API never resolves them here.
// ThrottlerGuard runs first because the export takes a serialized audit transaction.
// AuthGuard('oauth-client-access') verifies the bearer token and requires config:export
// before the handler runs, so an anonymous or under-scoped caller gets no config.
@ApiTags('config')
@ApiBearerAuth()
@UseGuards(ThrottlerGuard, AuthGuard('oauth-client-access'))
@ApiTooManyRequestsResponse({ description: 'The client exceeded the rate limit.' })
@Controller('api/config')
export class ConfigController {
  constructor(
    @Inject(GRAVESHIFT_CONFIG) private readonly config: GraveshiftConfig,
    @Inject(AUDIT_SINK) private readonly audit: AuditSink,
  ) {}

  // The whole validated config in one call: boot, agents, policy and fix.
  @Get('export')
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
    await this.recordExport(request.user);
    return this.config;
  }

  // Exactly one audit entry per export, with identifiers only: the entry carries the
  // project and the actor, and the payload names the exported part. No config content
  // enters the payload. If the append fails, the request fails closed: no config is
  // served before the entry is written.
  private recordExport(actor: Principal): Promise<unknown> {
    return this.audit.append(actor.projectId, {
      key: `config:exported:${randomUUID()}`,
      actor: actor.clientId,
      type: 'config.exported',
      payload: { exported: 'config' },
    });
  }
}
