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

import {
  DeployAuthGuard,
  RequestDeployPrincipal,
  RequireScopes,
} from '../deploys/guards/deploy-auth.guard';
import type { DeployPrincipal } from '../deploys/deploy.types';
import { CreateReleaseDto } from './dto/create-release.dto';
import { releaseListSchema, releaseSchema } from './releases.schema';
import { ReleasesService } from './releases.service';

@ApiTags('releases')
@ApiBearerAuth()
@UseGuards(ThrottlerGuard, DeployAuthGuard)
@ApiUnauthorizedResponse({ description: 'No valid bearer client token was presented.' })
@ApiForbiddenResponse({ description: 'The Organization, Project or scope is not allowed.' })
@ApiTooManyRequestsResponse({ description: 'The client exceeded the rate limit.' })
@Controller('api/organizations/:orgId')
export class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @Get('releases')
  @RequireScopes('org:read', 'project:read')
  @ApiOkResponse({
    description: 'The Releases in the caller Organization.',
    standardSchema: releaseListSchema,
  })
  list(@RequestDeployPrincipal() principal: DeployPrincipal) {
    return this.releases.list(principal);
  }

  @Post('releases')
  @RequireScopes('project:write', 'org:ci')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({
    description: 'A new Release linked to its Projects.',
    standardSchema: releaseSchema,
  })
  create(@RequestDeployPrincipal() principal: DeployPrincipal, @Body() dto: CreateReleaseDto) {
    return this.releases.create(principal, dto);
  }
}
