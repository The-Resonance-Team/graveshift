import { EnvelopeError } from '@graveshift/core';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { z } from 'zod';

import { AuditBusy, AuditConflict } from '../audit/audit.errors';
import { DeploymentClosure } from '../deploys/deployment-closure';
import { ProjectGrant } from '../internal/project-grant';
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
    private readonly closure: DeploymentClosure,
    private readonly grant: ProjectGrant,
  ) {}

  private async authorize(input: HauntingProjectDto): Promise<void> {
    await this.grant.assert(input.projectId);
  }

  async record(input: RecordHauntingDto) {
    await this.authorize(input);
    try {
      const view = await this.repo.upsert(
        input.projectId,
        input.eventId,
        input.view,
        input.environment,
      );
      await this.closure.apply(view, {
        projectId: input.projectId,
        ...(input.environment === undefined ? {} : { environment: input.environment }),
        view: input.view,
      });
      return view;
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

  async list(input: ListHauntingsDto) {
    await this.authorize(input);
    return this.repo.list(input.projectId, input.limit);
  }

  async get(input: GetHauntingDto) {
    await this.authorize(input);
    const view = await this.repo.get(input.projectId, input.id);
    if (!view) throw new NotFoundException('Haunting not found');
    return view;
  }

  async context(input: HauntingContextDto) {
    await this.authorize(input);
    const view = await this.repo.context(input.projectId, input.service, input.diagnosisRef);
    if (!view) throw new NotFoundException('Haunting context not found');
    return view;
  }

  async active(input: ActiveHauntingDto) {
    await this.authorize(input);
    return this.repo.active(input.projectId, input.service);
  }
}
