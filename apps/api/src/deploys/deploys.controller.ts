import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
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
  CreateDeployDto,
  DeploymentListQueryDto,
  DeploymentParamsDto,
} from './dto/create-deploy.dto';
import { DeployAuthGuard, RequestDeployPrincipal, RequireScopes } from './guards/deploy-auth.guard';
import { deployListSchema, deploySchema } from './deploys.schema';
import type { DeployPrincipal } from './deploy.types';
import { DeploysService } from './deploys.service';

interface JsonReply {
  status(code: number): JsonReply;
  json(value: unknown): void;
}

@ApiTags('deploys')
@ApiBearerAuth()
@UseGuards(ThrottlerGuard, DeployAuthGuard)
@ApiUnauthorizedResponse({ description: 'No valid bearer client token was presented.' })
@ApiForbiddenResponse({ description: 'The Organization, Project or scope is not allowed.' })
@ApiTooManyRequestsResponse({ description: 'The client exceeded the rate limit.' })
@Controller('api/organizations/:orgId/projects/:projectId/deployments')
export class DeploysController {
  constructor(private readonly deploys: DeploysService) {}

  @Get()
  @RequireScopes('org:read', 'project:read')
  @ApiOkResponse({
    description: 'The Deployments of the route Project in the caller Organization.',
    standardSchema: deployListSchema,
  })
  list(
    @RequestDeployPrincipal() principal: DeployPrincipal,
    @Param() params: DeploymentParamsDto,
    @Query() query: DeploymentListQueryDto,
  ) {
    return this.deploys.list(principal, params.projectId, query);
  }

  @Post()
  @RequireScopes('org:ci', 'project:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({
    description: 'An appended immutable Deployment. A redeploy returns the existing row.',
    standardSchema: deploySchema,
  })
  async create(
    @RequestDeployPrincipal() principal: DeployPrincipal,
    @Param() params: DeploymentParamsDto,
    @Body() dto: CreateDeployDto,
    @Res() response: JsonReply,
  ): Promise<void> {
    const { record, created } = await this.deploys.create(principal, params, dto);
    // A redeploy is idempotent: 200 with the stored row and no new audit entry.
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK).json(record);
  }
}
