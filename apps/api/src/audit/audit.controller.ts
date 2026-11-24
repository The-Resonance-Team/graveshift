import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalGuard } from '../internal/internal.guard';
import { ProjectGrant } from '../internal/project-grant';
import { AuditBusy, AuditConflict } from './audit.errors';
import { AUDIT_SINK, type AuditSink } from './audit.sink';
import { AppendAuditDto } from './dto/append-audit.dto';

@ApiExcludeController()
@UseGuards(InternalGuard)
@Controller('internal/audit')
export class InternalAuditController {
  constructor(
    @Inject(AUDIT_SINK) private readonly audit: AuditSink,
    private readonly grant: ProjectGrant,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async append(@Body() input: AppendAuditDto): Promise<{ key: string }> {
    await this.grant.assert(input.projectId);
    try {
      await this.audit.append(input.projectId, input.draft);
    } catch (error) {
      if (error instanceof AuditConflict) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      if (error instanceof AuditBusy) {
        throw new ServiceUnavailableException({ code: error.code, message: error.message });
      }
      throw error;
    }
    return { key: input.draft.key };
  }
}
