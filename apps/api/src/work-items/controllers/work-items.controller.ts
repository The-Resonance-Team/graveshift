import { WorkItemSchema } from '@graveshift/core';
import {
  FixResultSchema,
  TriageResultSchema,
  WorkRoutingSchema,
  workRouting,
  WORK_COMMANDS,
  type WorkCaller,
  type WorkCommands,
} from '@graveshift/work';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import type { PrincipalRequest } from '../../auth/auth.types';
import { AnswerRequestDto } from '../dto/answer-request.dto';
import { FixNowRequestDto } from '../dto/fix-now-request.dto';
import { ListWorkItemsQueryDto } from '../dto/list-work-items-query.dto';
import { TriageRequestDto } from '../dto/triage-request.dto';
import { WorkItemParamsDto } from '../dto/work-item-params.dto';
import { WorkCommandId, WorkCommandIdPipe } from '../work-command-id.pipe';
import { WorkErrorFilter } from '../work-error.filter';
import { WorkItemRepo } from '../work-item.repo';
import { workItemListResponseSchema } from '../work-item.schema';

const commandHeader = {
  name: 'Idempotency-Key',
  required: false,
  description: 'Reuse this ID to replay the recorded result after a connection failure.',
};

const commandResponseHeaders = {
  'Idempotency-Key': {
    description: 'The supplied or generated command ID. Reuse it for retries.',
    schema: { type: 'string', maxLength: 100 },
  },
} as const;

function caller(request: PrincipalRequest, commandId: string): WorkCaller {
  return { projectId: request.user.projectId, actor: request.user.clientId, commandId };
}

@ApiTags('work-items')
@UseGuards(ThrottlerGuard, AuthGuard('oauth-client-credentials'))
@UseFilters(WorkErrorFilter)
@ApiUnauthorizedResponse({ description: 'A management access token is required.' })
@Controller('api/work-items')
export class WorkItemsController {
  constructor(
    private readonly work: WorkItemRepo,
    @Inject(WORK_COMMANDS) private readonly commands: WorkCommands,
  ) {}

  @Get()
  @ApiOkResponse({
    description: 'Work items ordered by fix priority, title, and ID.',
    standardSchema: workItemListResponseSchema,
  })
  list(@Query() query: ListWorkItemsQueryDto, @Req() request: PrincipalRequest) {
    return this.work.list(request.user.projectId, query);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'One Work item.', standardSchema: WorkItemSchema })
  @ApiNotFoundResponse({ description: 'The Work item does not exist in this project.' })
  async get(@Param() params: WorkItemParamsDto, @Req() request: PrincipalRequest) {
    return (await this.work.read({ projectId: request.user.projectId, id: params.id })).item;
  }

  @Get(':id/routing')
  @ApiOkResponse({
    description:
      'Safe active Fix attempt summary. Recover a saved question after a lost response or restart. No request text or Agent params are returned.',
    standardSchema: WorkRoutingSchema,
  })
  @ApiNotFoundResponse({ description: 'The Work item does not exist in this project.' })
  async routing(@Param() params: WorkItemParamsDto, @Req() request: PrincipalRequest) {
    return workRouting(await this.work.read({ projectId: request.user.projectId, id: params.id }));
  }

  @Post(':id/triage')
  @HttpCode(200)
  @ApiHeader(commandHeader)
  @ApiOkResponse({
    description:
      'Saved assignment and auto-fix outcome. Human assignment is manual. The selected Agent autoFix setting controls the trigger.',
    standardSchema: TriageResultSchema,
    headers: commandResponseHeaders,
  })
  @ApiUnprocessableEntityResponse({
    description: 'The assignee is invalid or the Agent is unknown.',
  })
  @ApiConflictResponse({
    description: 'The Work item is complete, has an active attempt, or the command ID conflicts.',
  })
  @ApiNotFoundResponse({ description: 'The Work item does not exist in this project.' })
  triage(
    @Param() params: WorkItemParamsDto,
    @Body() body: TriageRequestDto,
    @Req() request: PrincipalRequest,
    @WorkCommandId(WorkCommandIdPipe) commandId: string,
  ) {
    return this.commands.triage(caller(request, commandId), params.id, body);
  }

  @Post(':id/fix-now')
  @HttpCode(200)
  @ApiHeader(commandHeader)
  @ApiOkResponse({
    description:
      'Waits for the Fix attempt outcome. Missing Agent params return one saved question and its attempt ID.',
    standardSchema: FixResultSchema,
    headers: commandResponseHeaders,
  })
  @ApiForbiddenResponse({
    description:
      'Human assignments have no Fix now action. Agent autoFix must be disabled for Fix now.',
  })
  @ApiUnprocessableEntityResponse({ description: 'The request body is invalid.' })
  @ApiConflictResponse({
    description: 'The Work item is complete, has an active attempt, or the command ID conflicts.',
  })
  @ApiNotFoundResponse({ description: 'The Work item does not exist in this project.' })
  fixNow(
    @Param() params: WorkItemParamsDto,
    @Body() body: FixNowRequestDto,
    @Req() request: PrincipalRequest,
    @WorkCommandId(WorkCommandIdPipe) commandId: string,
  ) {
    return this.commands.fixNow(caller(request, commandId), params.id, body);
  }

  @Post(':id/answer')
  @HttpCode(200)
  @ApiHeader(commandHeader)
  @ApiOkResponse({
    description:
      'A complete answer resumes the same Fix attempt and trigger. An incomplete answer assigns the Work item to a person for manual work.',
    standardSchema: FixResultSchema,
    headers: commandResponseHeaders,
  })
  @ApiUnprocessableEntityResponse({
    description: 'The answer contains invalid or undeclared params.',
  })
  @ApiConflictResponse({
    description: 'The question is no longer pending or the command ID conflicts.',
  })
  @ApiNotFoundResponse({ description: 'The Work item does not exist in this project.' })
  answer(
    @Param() params: WorkItemParamsDto,
    @Body() body: AnswerRequestDto,
    @Req() request: PrincipalRequest,
    @WorkCommandId(WorkCommandIdPipe) commandId: string,
  ) {
    return this.commands.answer(caller(request, commandId), params.id, body);
  }
}
