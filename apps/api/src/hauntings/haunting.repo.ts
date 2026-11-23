import { prepareRecordedHaunting, type RecordedHaunting } from '@graveshift/core/recorded';
import { Injectable } from '@nestjs/common';

import { AuditRepo } from '../audit/audit.repo';
import { inAuditTransaction } from '../audit/audit.transaction';
import { PrismaService } from '../infra/prisma.service';
import { HauntingConflict } from './haunting.errors';
import { appliedSeq, hauntingData, mergeRecorded, toRecordedHaunting } from './haunting.mapper';
import { HAUNTING_SELECT } from './haunting.select';

@Injectable()
export class HauntingRepo {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepo,
  ) {}

  async upsert(
    projectId: string,
    eventId: string,
    input: RecordedHaunting,
  ): Promise<RecordedHaunting> {
    const view = prepareRecordedHaunting(input);
    const deploymentId = view.deploymentId ?? null;
    if (view.detections.some((entry) => entry.projectId !== projectId))
      throw new HauntingConflict();
    return inAuditTransaction(this.prisma, async (tx) => {
      const entry = await this.audit.appendInTx(tx, projectId, {
        key: `haunting:${eventId}`,
        actor: 'daemon',
        type: 'haunting.recorded',
        incidentId: view.incident.id,
        payload: { view, deploymentId },
      });
      const where = { projectId_id: { projectId, id: view.incident.id } };
      const row = await tx.haunting.findUnique({ where, select: HAUNTING_SELECT });
      const prior = row ? toRecordedHaunting(row) : undefined;
      if (row && entry.seq <= appliedSeq(row)) return toRecordedHaunting(row);
      if (
        prior &&
        (prior.incident.service !== view.incident.service ||
          prior.incident.openedAt !== view.incident.openedAt ||
          Date.parse(view.incident.updatedAt) < Date.parse(prior.incident.updatedAt))
      )
        throw new HauntingConflict();
      const recorded = mergeRecorded(prior, view);
      const data = hauntingData(recorded, entry.seq);
      const saved = await tx.haunting.upsert({
        where,
        create: { projectId, ...data },
        update: data,
        select: HAUNTING_SELECT,
      });
      return toRecordedHaunting(saved);
    });
  }

  async list(projectId: string, limit = 50): Promise<RecordedHaunting[]> {
    const rows = await this.prisma.haunting.findMany({
      where: { projectId },
      orderBy: [{ openedAt: 'desc' }, { id: 'asc' }],
      take: limit,
      select: HAUNTING_SELECT,
    });
    return rows.map(toRecordedHaunting);
  }

  async get(projectId: string, id: string): Promise<RecordedHaunting | undefined> {
    const row = await this.prisma.haunting.findUnique({
      where: { projectId_id: { projectId, id } },
      select: HAUNTING_SELECT,
    });
    return row ? toRecordedHaunting(row) : undefined;
  }

  async context(projectId: string, service: string, diagnosisRef: string) {
    const row = await this.prisma.haunting.findFirst({
      where: { projectId, service, diagnosis: { path: ['id'], equals: diagnosisRef } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: HAUNTING_SELECT,
    });
    return row ? toRecordedHaunting(row) : undefined;
  }

  async active(projectId: string, service: string): Promise<RecordedHaunting | null> {
    const row = await this.prisma.haunting.findFirst({
      where: { projectId, service, state: { notIn: ['resolved', 'dismissed'] } },
      orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
      select: HAUNTING_SELECT,
    });
    return row ? toRecordedHaunting(row) : null;
  }
}
