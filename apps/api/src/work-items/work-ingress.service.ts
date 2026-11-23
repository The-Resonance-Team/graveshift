import { WorkError, type CreatedWorkResult, type FromHaunting } from '@graveshift/work';
import { Inject, Injectable } from '@nestjs/common';

import { BOOT_CONFIG, type RootBootConfig } from '../config/boot.config';
import { HauntingRepo } from '../hauntings/haunting.repo';
import { ProjectGrant } from '../internal/project-grant';
import { workFromHaunting } from './work-haunting.mapper';
import { WorkItemRepo } from './work-item.repo';

@Injectable()
export class WorkIngressService {
  constructor(
    private readonly hauntings: HauntingRepo,
    private readonly work: WorkItemRepo,
    private readonly grant: ProjectGrant,
    @Inject(BOOT_CONFIG) private readonly config: Pick<RootBootConfig, 'agents'>,
  ) {}

  async fromHaunting(input: FromHaunting): Promise<CreatedWorkResult> {
    try {
      await this.grant.assert(input.projectId);
    } catch {
      throw new WorkError('PROJECT_FORBIDDEN', 'This project is not granted to this integration');
    }
    const existing = await this.work.findByHaunting(input.projectId, input.incidentId);
    if (existing !== undefined) return { item: existing, created: false };
    const view = await this.hauntings.get(input.projectId, input.incidentId);
    if (view === undefined)
      throw new WorkError('HAUNTING_NOT_FOUND', 'This Haunting does not exist');
    return this.work.createFromHaunting(
      input,
      workFromHaunting(input.projectId, view, this.config.agents),
    );
  }
}
