import { EnvelopeError } from '@graveshift/core';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import { AuditBusy, AuditConflict } from '../audit/audit.errors';
import type {
  ActiveHauntingDto,
  GetHauntingDto,
  HauntingContextDto,
  HauntingProjectDto,
  ListHauntingsDto,
  RecordHauntingDto,
} from './dto/haunting.dto';
import { HauntingConflict } from './haunting.errors';
import { HauntingRepo } from './haunting.repo';

@Injectable()
export class HauntingService {
  constructor(
    private readonly repo: HauntingRepo,
    private readonly config: ConfigService,
  ) {}

  private authorize(input: HauntingProjectDto): void {
    if (input.projectId !== this.config.getOrThrow<string>('GRAVESHIFT_PROJECT_ID')) {
      throw new ForbiddenException('Internal project does not match this API');
    }
  }

  async record(input: RecordHauntingDto) {
    this.authorize(input);
    try {
      return await this.repo.upsert(input.projectId, input.eventId, input.view);
    } catch (error) {
      if (error instanceof AuditConflict || error instanceof HauntingConflict) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      if (error instanceof AuditBusy) throw new ServiceUnavailableException({ code: error.code });
      if (error instanceof EnvelopeError || error instanceof z.ZodError) {
        throw new UnprocessableEntityException('Recorded Haunting data is invalid');
      }
      throw error;
    }
  }

  list(input: ListHauntingsDto) {
    this.authorize(input);
    return this.repo.list(input.projectId, input.limit);
  }

  async get(input: GetHauntingDto) {
    this.authorize(input);
    const view = await this.repo.get(input.projectId, input.id);
    if (!view) throw new NotFoundException('Haunting not found');
    return view;
  }

  async context(input: HauntingContextDto) {
    this.authorize(input);
    const view = await this.repo.context(input.projectId, input.service, input.diagnosisRef);
    if (!view) throw new NotFoundException('Haunting context not found');
    return view;
  }

  active(input: ActiveHauntingDto) {
    this.authorize(input);
    return this.repo.active(input.projectId, input.service);
  }
}
