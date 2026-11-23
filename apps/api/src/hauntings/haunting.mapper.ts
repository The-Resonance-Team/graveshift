import { IncidentSchema } from '@graveshift/core';
import {
  HauntingCategorySchema,
  prepareRecordedHaunting,
  RecordedHauntingSchema,
  type RecordedHaunting,
} from '@graveshift/core/recorded';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import type { HauntingRow } from './haunting.select';

// The JSON column also owns presentation metadata and the last applied audit position.
const storedIncident = IncidentSchema.extend({
  severity: RecordedHauntingSchema.shape.severity,
  category: HauntingCategorySchema.optional(),
  auditSeq: z.number().int().min(1),
}).strict();

export function appliedSeq(row: HauntingRow): number {
  return storedIncident.parse(row.incident).auditSeq;
}

export function toRecordedHaunting(row: HauntingRow): RecordedHaunting {
  const {
    severity,
    category,
    auditSeq: _auditSeq,
    ...incident
  } = storedIncident.parse(row.incident);
  return prepareRecordedHaunting({
    incident,
    ...(severity === undefined ? {} : { severity }),
    ...(category === undefined ? {} : { category }),
    detections: row.detections,
    ...(row.pr === null ? {} : { pr: row.pr }),
    timeline: row.timeline,
    deploymentId: row.deploymentId,
    deploymentEnvironment: row.deploymentEnvironment,
  });
}

export function hauntingData(view: RecordedHaunting, auditSeq: number) {
  const { incident } = view;
  return {
    id: incident.id,
    service: incident.service,
    state: incident.state,
    incident: {
      ...incident,
      ...(view.severity === undefined ? {} : { severity: view.severity }),
      ...(view.category === undefined ? {} : { category: view.category }),
      auditSeq,
    },
    diagnosis: incident.diagnosis ?? Prisma.DbNull,
    detections: view.detections,
    pr: view.pr ?? Prisma.DbNull,
    timeline: view.timeline ?? [],
    deploymentId: view.deploymentId ?? null,
    deploymentEnvironment: view.deploymentEnvironment ?? null,
    openedAt: new Date(incident.openedAt),
    updatedAt: new Date(incident.updatedAt),
  } satisfies Omit<Prisma.HauntingCreateInput, 'projectId'>;
}

export function mergeRecorded(prior: RecordedHaunting | undefined, next: RecordedHaunting) {
  const diagnosis = next.incident.diagnosis ?? prior?.incident.diagnosis;
  const lastActionAt = next.incident.lastActionAt ?? prior?.incident.lastActionAt;
  return prepareRecordedHaunting({
    ...prior,
    ...next,
    // The opening Event owns the Deployment pair; later observations cannot move it.
    deploymentId: next.deploymentId ?? prior?.deploymentId ?? null,
    deploymentEnvironment: next.deploymentEnvironment ?? prior?.deploymentEnvironment ?? null,
    incident: {
      ...next.incident,
      ...(diagnosis ? { diagnosis } : {}),
      ...(lastActionAt === undefined ? {} : { lastActionAt }),
    },
    timeline: next.timeline ?? [
      ...(prior?.timeline ?? []),
      {
        at: next.incident.updatedAt,
        type: next.incident.state,
        detail: `Haunting ${next.incident.state}`,
      },
    ],
  });
}
