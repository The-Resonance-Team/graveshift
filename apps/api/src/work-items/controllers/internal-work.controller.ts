import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalGuard } from '../../internal/internal.guard';
import {
  AbandonDto,
  AbortPublicationDto,
  ApplyAnswerDto,
  BeginPublicationDto,
  ClaimFixDto,
  FinishAttemptDto,
  HeartbeatDto,
  ReadWorkDto,
  RecordPublicationDto,
  ReplayWorkDto,
  SaveQuestionDto,
  SaveTriageDto,
} from '../dto/internal-work.dto';
import { WorkItemParamsDto } from '../dto/work-item-params.dto';
import { WorkErrorFilter } from '../work-error.filter';
import { WorkItemRepo } from '../work-item.repo';

interface JsonReply {
  status(code: number): JsonReply;
  json(value: unknown): void;
}

@ApiExcludeController()
@UseGuards(InternalGuard)
@UseFilters(WorkErrorFilter)
@Controller('internal/work-items')
export class InternalWorkController {
  constructor(private readonly work: WorkItemRepo) {}

  @Post(':id/read')
  @HttpCode(200)
  read(@Param() params: WorkItemParamsDto, @Body() body: ReadWorkDto) {
    return this.work.read({ projectId: body.projectId, id: params.id });
  }

  @Post(':id/replay')
  @HttpCode(200)
  async replay(
    @Param() params: WorkItemParamsDto,
    @Body() body: ReplayWorkDto,
    @Res() response: JsonReply,
  ): Promise<void> {
    // An absent receipt is `null` on the wire. Nest's default null result is an empty body.
    response
      .status(200)
      .json(await this.work.replay({ caller: body.caller, id: params.id, input: body.request }));
  }

  @Post(':id/save-triage')
  @HttpCode(200)
  saveTriage(@Param() params: WorkItemParamsDto, @Body() body: SaveTriageDto) {
    return this.work.saveTriage({ caller: body.caller, id: params.id, input: body.input });
  }

  @Post(':id/claim')
  @HttpCode(200)
  claim(@Param() params: WorkItemParamsDto, @Body() body: ClaimFixDto) {
    return this.work.claim({ caller: body.caller, id: params.id, input: body.input });
  }

  @Post(':id/save-question')
  @HttpCode(200)
  saveQuestion(@Param() params: WorkItemParamsDto, @Body() body: SaveQuestionDto) {
    return this.work.saveQuestion({ caller: body.caller, id: params.id, input: body.input });
  }

  @Post(':id/apply-answer')
  @HttpCode(200)
  applyAnswer(@Param() params: WorkItemParamsDto, @Body() body: ApplyAnswerDto) {
    return this.work.applyAnswer({ caller: body.caller, id: params.id, input: body.input });
  }

  @Post(':id/begin-publication')
  @HttpCode(200)
  beginPublication(@Param() params: WorkItemParamsDto, @Body() body: BeginPublicationDto) {
    return this.work.beginPublication({ caller: body.caller, id: params.id, input: body.input });
  }

  @Post(':id/record-publication')
  @HttpCode(200)
  recordPublication(@Param() params: WorkItemParamsDto, @Body() body: RecordPublicationDto) {
    return this.work.recordPublication({ caller: body.caller, id: params.id, input: body.input });
  }

  @Post(':id/finish')
  @HttpCode(200)
  finish(@Param() params: WorkItemParamsDto, @Body() body: FinishAttemptDto) {
    return this.work.finish({ caller: body.caller, id: params.id, input: body.input });
  }

  @Post(':id/heartbeat')
  @HttpCode(200)
  heartbeat(@Param() params: WorkItemParamsDto, @Body() body: HeartbeatDto) {
    return this.work.heartbeat({ caller: body.caller, id: params.id, input: body.input });
  }

  @Post(':id/abandon')
  @HttpCode(200)
  abandon(@Param() params: WorkItemParamsDto, @Body() body: AbandonDto) {
    return this.work.abandon({ caller: body.caller, id: params.id, input: body.input });
  }

  @Post(':id/abort-publication')
  @HttpCode(200)
  abortPublication(@Param() params: WorkItemParamsDto, @Body() body: AbortPublicationDto) {
    return this.work.abortPublication({ caller: body.caller, id: params.id, input: body.input });
  }
}
