import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalGuard } from '../internal/internal.guard';
import { AuditBusy, AuditConflict } from './audit.errors';
import { AuditRepo } from './audit.repo';
import { AppendAuditDto } from './dto/append-audit.dto';

@ApiExcludeController()
@UseGuards(InternalGuard)
@Controller('internal/audit')
export class InternalAuditController {
  constructor(
    private readonly audit: AuditRepo,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async append(@Body() input: AppendAuditDto): Promise<{ key: string }> {
    if (input.projectId !== this.config.getOrThrow<string>('GRAVESHIFT_PROJECT_ID')) {
      throw new ForbiddenException('Internal project does not match this API');
    }
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
