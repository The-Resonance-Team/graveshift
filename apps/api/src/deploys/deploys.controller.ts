import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { CreateDeployDto } from './dto/create-deploy.dto';
import { DeployAuthGuard, RequestDeployPrincipal, RequireScopes } from './guards/deploy-auth.guard';
import { deployListSchema, deploySchema } from './deploys.schema';
import type { DeployPrincipal } from './deploy.types';
import { DeploysService } from './deploys.service';

@ApiTags('deploys')
@ApiBearerAuth()
@UseGuards(ThrottlerGuard, DeployAuthGuard)
@ApiUnauthorizedResponse({ description: 'No valid bearer client token was presented.' })
@ApiForbiddenResponse({ description: 'The Organization, Project or scope is not allowed.' })
@ApiTooManyRequestsResponse({ description: 'The client exceeded the rate limit.' })
@Controller('api/organizations/:orgId')
export class DeploysController {
  constructor(private readonly deploys: DeploysService) {}

  @Get('deploys')
  @RequireScopes('org:read', 'project:read')
  @ApiOkResponse({
    description: 'The Deploys in the caller Organization.',
    standardSchema: deployListSchema,
  })
  list(@RequestDeployPrincipal() principal: DeployPrincipal) {
    return this.deploys.list(principal);
  }

  @Post('deploys')
  @RequireScopes('org:ci', 'project:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({
    description: 'An appended immutable Deploy.',
    standardSchema: deploySchema,
  })
  create(@RequestDeployPrincipal() principal: DeployPrincipal, @Body() dto: CreateDeployDto) {
    return this.deploys.create(principal, dto);
  }
}
