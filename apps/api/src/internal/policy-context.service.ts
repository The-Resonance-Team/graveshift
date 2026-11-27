import { SharedPolicyContextSchema } from '@graveshift/core/policy-context';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { AUDIT_READER, type AuditReader } from '../audit/audit.sink';
import { BOOT_CONFIG, type RootBootConfig } from '../config/boot.config';
import { HauntingRepo } from '../hauntings/haunting.repo';
import { ProjectGrant } from './project-grant';
import { WorkItemRepo } from '../work-items/work-item.repo';
import type { PolicyContextDto } from './policy-context.dto';

@Injectable()
export class PolicyContextService {
  constructor(
    @Inject(BOOT_CONFIG) private readonly config: RootBootConfig,
    private readonly hauntings: HauntingRepo,
    private readonly workItems: WorkItemRepo,
    @Inject(AUDIT_READER) private readonly audit: AuditReader,
    private readonly grant: ProjectGrant,
  ) {}

  async resolve(input: PolicyContextDto) {
    await this.grant.assert(input.projectId);
    const view = input.incidentId
      ? await this.hauntings.get(input.projectId, input.incidentId)
      : input.diagnosisRef
        ? await this.hauntings.context(input.projectId, input.service, input.diagnosisRef)
        : undefined;
    if (!view?.incident.diagnosis || view.incident.service !== input.service) {
      throw new ServiceUnavailableException('Recorded Diagnosis facts are unavailable');
    }
    const [usage, openPrsLastHour] = await Promise.all([
      this.audit.policyUsage(input.projectId, input.service, view.incident.id),
      this.workItems.publicationCount(input.projectId),
    ]);
    return SharedPolicyContextSchema.parse({
      service: input.service,
      ...(view.category === undefined ? {} : { category: view.category }),
      signals: view.detections.map((detection) => detection.rule),
      confidence: view.incident.diagnosis.confidence,
      ...(this.config.mode === undefined ? {} : { envMode: this.config.mode }),
      counters: { ...usage, openPrsLastHour },
    });
  }
}
