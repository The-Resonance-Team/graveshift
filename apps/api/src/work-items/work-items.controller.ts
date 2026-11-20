import {
  AGENT_ASSIGNEE_PREFIX,
  assertTriageAllowed,
  NEEDS_HUMAN,
  ok,
  parseAssignee,
  triageToAgent,
  triageToHuman,
  type WorkItem,
  WorkItemSchema,
} from '@graveshift/core';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { WORK_ITEM_POLICY, type WorkItemPolicy } from './work-item.policy';
import {
  type ListWorkItemsQuery,
  listWorkItemsQuerySchema,
  type TriageRequest,
  triageRequestSchema,
  type WorkItemListResponse,
  workItemListResponseSchema,
  type WorkItemParams,
  workItemParamsSchema,
} from './work-item.schema';
import { WorkItemStore } from './work-item.store';

@ApiTags('work-items')
@Controller('api/work-items')
export class WorkItemsController {
  constructor(
    private readonly store: WorkItemStore,
    @Inject(WORK_ITEM_POLICY) private readonly policy: WorkItemPolicy,
  ) {}

  @Get()
  @ApiOkResponse({
    description: 'A page of work items for the table.',
    standardSchema: workItemListResponseSchema,
  })
  list(
    @Query({ schema: listWorkItemsQuerySchema }) query: ListWorkItemsQuery,
  ): WorkItemListResponse {
    const items = this.store.list();
    return {
      items: items.slice(query.offset, query.offset + query.limit),
      total: items.length,
      offset: query.offset,
      limit: query.limit,
    };
  }

  @Get(':id')
  @ApiOkResponse({
    description: 'One work item for the detail sheet.',
    standardSchema: WorkItemSchema,
  })
  @ApiNotFoundResponse({ description: 'No work item has this id.' })
  get(@Param({ schema: workItemParamsSchema }) params: WorkItemParams): WorkItem {
    const item = this.store.get(params.id);
    if (!item) throw new NotFoundException(`Unknown work item: ${params.id}`);
    return item;
  }

  @Post(':id/triage')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'The triaged work item.', standardSchema: WorkItemSchema })
  @ApiBadRequestResponse({ description: 'The assignee is not valid.' })
  @ApiConflictResponse({ description: 'The work item is in a terminal status.' })
  @ApiNotFoundResponse({ description: 'No work item has this id.' })
  triage(
    @Param({ schema: workItemParamsSchema }) params: WorkItemParams,
    @Body({ schema: triageRequestSchema }) body: TriageRequest,
  ): WorkItem {
    const item = this.store.get(params.id);
    if (!item) throw new NotFoundException(`Unknown work item: ${params.id}`);

    const allowed = assertTriageAllowed(item);
    if (!allowed.ok) throw new ConflictException(allowed.error.message);

    const assignee = parseAssignee(body.assignee, this.policy.agentNames);
    if (!assignee.ok) throw new BadRequestException(assignee.error.message);

    const result =
      assignee.value === NEEDS_HUMAN
        ? ok(triageToHuman(item, this.policy.clientConfig))
        : triageToAgent(
            item,
            assignee.value.slice(AGENT_ASSIGNEE_PREFIX.length),
            this.policy.agentNames,
            this.policy.clientConfig,
          );
    if (!result.ok) throw new BadRequestException(result.error.message);

    this.store.save(result.value);
    return result.value;
  }
}
