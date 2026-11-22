import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import type { DeployPrincipal } from '../deploys/deploy.types';
import {
  DeployAuthGuard,
  RequestDeployPrincipal,
  RequireScopes,
} from '../deploys/guards/deploy-auth.guard';
import { environmentListSchema } from './environments.schema';
import { EnvironmentsService } from './environments.service';

@ApiTags('environments')
@ApiBearerAuth()
@UseGuards(ThrottlerGuard, DeployAuthGuard)
@ApiUnauthorizedResponse({ description: 'No valid bearer client token was presented.' })
@ApiForbiddenResponse({ description: 'The Organization or scope is not allowed.' })
@ApiTooManyRequestsResponse({ description: 'The client exceeded the rate limit.' })
@Controller('api/organizations/:orgId')
export class EnvironmentsController {
  constructor(private readonly environments: EnvironmentsService) {}

  @Get('environments')
  @RequireScopes('org:read', 'project:read')
  @ApiOkResponse({
    description: 'The Environments in the caller Organization.',
    standardSchema: environmentListSchema,
  })
  list(@RequestDeployPrincipal() principal: DeployPrincipal) {
    return this.environments.list(principal);
  }
}
