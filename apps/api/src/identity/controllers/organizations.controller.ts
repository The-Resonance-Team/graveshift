import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param as ParamParams,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import {
  AddMemberDto,
  CreateOAuthClientDto,
  CreateOrganizationDto,
  CreateProjectDto,
  OrgParamsDto,
} from '../dto/identity.dto';
import { AccountAuthGuard } from '../guards/account-auth.guard';
import {
  oauthClientSchema,
  organizationSchema,
  projectListSchema,
  projectSchema,
} from '../identity.schema';
import { IdentityService } from '../services/identity.service';
import { RequestAccountId } from './account.controller';

@ApiTags('organizations')
@UseGuards(AccountAuthGuard)
@Controller('api/organizations')
export class OrganizationsController {
  constructor(private readonly identity: IdentityService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOkResponse({
    description: 'A new Organization owned by the caller.',
    standardSchema: organizationSchema,
  })
  async create(@RequestAccountId() accountId: string, @Body() dto: CreateOrganizationDto) {
    return this.identity.createOrganization(accountId, dto);
  }

  @Get(':orgId/projects')
  @ApiOkResponse({
    description: 'The Projects in one Organization.',
    standardSchema: projectListSchema,
  })
  async projects(@RequestAccountId() accountId: string, @ParamParams() params: OrgParamsDto) {
    return this.identity.listProjects(accountId, params.orgId);
  }

  @Post(':orgId/projects')
  @HttpCode(HttpStatus.CREATED)
  @ApiOkResponse({
    description: 'A new Project with an assigned numeric id.',
    standardSchema: projectSchema,
  })
  async createProject(
    @RequestAccountId() accountId: string,
    @ParamParams() params: OrgParamsDto,
    @Body() dto: CreateProjectDto,
  ) {
    return this.identity.createProject(accountId, params.orgId, dto);
  }

  @Post(':orgId/members')
  @HttpCode(HttpStatus.OK)
  async addMember(
    @RequestAccountId() accountId: string,
    @ParamParams() params: OrgParamsDto,
    @Body() dto: AddMemberDto,
  ) {
    return this.identity.addMember(accountId, params.orgId, dto);
  }

  @Post(':orgId/oauth-clients')
  @HttpCode(HttpStatus.CREATED)
  @ApiOkResponse({
    description: 'A new OAuth client bound to one Project.',
    standardSchema: oauthClientSchema,
  })
  async createOAuthClient(
    @RequestAccountId() accountId: string,
    @ParamParams() params: OrgParamsDto,
    @Body() dto: CreateOAuthClientDto,
  ) {
    return this.identity.createOAuthClient(accountId, params.orgId, dto);
  }
}
