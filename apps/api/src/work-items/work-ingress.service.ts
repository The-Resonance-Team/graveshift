import { WorkError, type CreatedWorkResult, type FromHaunting } from '@graveshift/work';
import { Inject, Injectable } from '@nestjs/common';

import { BOOT_CONFIG, type RootBootConfig } from '../config/boot.config';
import { HauntingRepo } from '../hauntings/haunting.repo';
import { workFromHaunting } from './work-haunting.mapper';
import { WorkItemRepo } from './work-item.repo';

@Injectable()
export class WorkIngressService {
  constructor(
    private readonly hauntings: HauntingRepo,
    private readonly work: WorkItemRepo,
    @Inject(BOOT_CONFIG) private readonly config: Pick<RootBootConfig, 'projectId' | 'agents'>,
  ) {}

  async fromHaunting(input: FromHaunting): Promise<CreatedWorkResult> {
    if (input.projectId !== this.config.projectId)
      throw new WorkError('PROJECT_FORBIDDEN', 'This project is not available on this host');
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
