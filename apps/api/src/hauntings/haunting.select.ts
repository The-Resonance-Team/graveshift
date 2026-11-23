import type { Prisma } from '@prisma/client';

export const HAUNTING_SELECT = {
  projectId: true,
  id: true,
  service: true,
  state: true,
  incident: true,
  diagnosis: true,
  detections: true,
  pr: true,
  timeline: true,
  deploymentId: true,
  deploymentEnvironment: true,
  openedAt: true,
  updatedAt: true,
} satisfies Prisma.HauntingSelect;
export type HauntingRow = Prisma.HauntingGetPayload<{ select: typeof HAUNTING_SELECT }>;
