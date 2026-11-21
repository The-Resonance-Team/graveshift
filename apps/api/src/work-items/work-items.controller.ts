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
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { FixService } from '../fix/fix.service';
import { FixNowRequestDto } from './dto/fix-now-request.dto';
import { ListWorkItemsQueryDto } from './dto/list-work-items-query.dto';
import { TriageRequestDto } from './dto/triage-request.dto';
import { WorkItemParamsDto } from './dto/work-item-params.dto';
import { WORK_ITEM_POLICY, type WorkItemPolicy } from './work-item.policy';
import {
  type FixResultResponse,
  fixResultSchema,
  type TriageResultResponse,
  triageResultSchema,
  type WorkItemListResponse,
  workItemListResponseSchema,
} from './work-item.schema';
import { WorkItemStore } from './work-item.store';

@ApiTags('work-items')
@Controller('api/work-items')
export class WorkItemsController {
  constructor(
    private readonly store: WorkItemStore,
    @Inject(WORK_ITEM_POLICY) private readonly policy: WorkItemPolicy,
    private readonly fixer: FixService,
  ) {}

  @Get()
  @ApiOkResponse({
    description: 'A page of work items for the table.',
    standardSchema: workItemListResponseSchema,
  })
  list(@Query() query: ListWorkItemsQueryDto): WorkItemListResponse {
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
  get(@Param() params: WorkItemParamsDto): WorkItem {
    const item = this.store.get(params.id);
    if (!item) throw new NotFoundException(`Unknown work item: ${params.id}`);
    return item;
  }

  @Post(':id/triage')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'The triaged work item and its auto-fix outcome.',
    standardSchema: triageResultSchema,
  })
  @ApiUnprocessableEntityResponse({ description: 'The assignee is not valid.' })
  @ApiConflictResponse({ description: 'The work item is in a terminal status.' })
  @ApiNotFoundResponse({ description: 'No work item has this id.' })
  async triage(
    @Param() params: WorkItemParamsDto,
    @Body() body: TriageRequestDto,
  ): Promise<TriageResultResponse> {
    const item = this.store.get(params.id);
    if (!item) throw new NotFoundException(`Unknown work item: ${params.id}`);

    const allowed = assertTriageAllowed(item);
    if (!allowed.ok) throw new ConflictException(allowed.error.message);

    const assignee = parseAssignee(body.assignee, this.policy.agentNames);
    if (!assignee.ok) throw new UnprocessableEntityException(assignee.error.message);

    const result =
      assignee.value === NEEDS_HUMAN
        ? ok(triageToHuman(item, this.policy.clientConfig))
        : triageToAgent(
            item,
            assignee.value.slice(AGENT_ASSIGNEE_PREFIX.length),
            this.policy.agentNames,
            this.policy.clientConfig,
          );
    if (!result.ok) throw new UnprocessableEntityException(result.error.message);

    // Triage is the real auto-fix trigger: client config sets autoFixAllowed here.
    // A failed auto-fix is reported in the result; the triage state is still saved.
    let final = result.value;
    let autoFix: TriageResultResponse['autoFix'] = null;
    if (result.value.autoFixAllowed) {
      try {
        const fixed = await this.fixer.autoFix(result.value);
        final = fixed.item;
        autoFix = {
          ok: fixed.ok,
          effect: fixed.effect,
          reason: fixed.reason ?? null,
          failure: fixed.failure,
        };
      } catch (error) {
        autoFix = {
          ok: false,
          effect: 'deny',
          reason: error instanceof Error ? error.message : 'unknown auto-fix failure',
          failure: 'fix_error',
        };
      }
    }
    this.store.save(final);
    return { item: final, autoFix };
  }

  @Post(':id/fix-now')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'The fix result with the work item, the policy effect and the draft PR ref.',
    standardSchema: fixResultSchema,
  })
  @ApiUnprocessableEntityResponse({ description: 'The request body is not valid.' })
  @ApiConflictResponse({ description: 'The work item is in a terminal status.' })
  @ApiNotFoundResponse({ description: 'No work item has this id.' })
  async fixNow(
    @Param() params: WorkItemParamsDto,
    @Body() body: FixNowRequestDto,
  ): Promise<FixResultResponse> {
    const item = this.store.get(params.id);
    if (!item) throw new NotFoundException(`Unknown work item: ${params.id}`);

    const allowed = assertTriageAllowed(item);
    if (!allowed.ok) throw new ConflictException(allowed.error.message);

    const result = await this.fixer.fixNow(item, body);
    this.store.save(result.item);
    return {
      item: result.item,
      trigger: result.trigger,
      effect: result.effect,
      ok: result.ok,
      pr: result.pr ?? null,
      reason: result.reason ?? null,
      failure: result.failure,
    };
  }
}
