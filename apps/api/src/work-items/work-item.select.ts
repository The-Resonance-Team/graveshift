import type { Prisma } from '@prisma/client';

export const WORK_ITEM_SELECT = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  successCriteria: true,
  subtasks: true,
  status: true,
  priority: true,
  assignee: true,
  reporter: true,
  startDate: true,
  dueDate: true,
  sprint: true,
  parent: true,
  labels: true,
  team: true,
  watchers: true,
  severity: true,
  service: true,
  diagnosisRef: true,
  diagnosis: true,
  fixPriority: true,
  draftPr: true,
  activeAttemptId: true,
  version: true,
} satisfies Prisma.WorkItemSelect;

export const FIX_ATTEMPT_SELECT = {
  id: true,
  projectId: true,
  commandId: true,
  workerId: true,
  leaseUntil: true,
  workItemId: true,
  agent: true,
  trigger: true,
  state: true,
  routingProgress: true,
  params: true,
  questionId: true,
  result: true,
  publication: true,
  baseSha: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FixAttemptSelect;

export const WORK_COMMAND_SELECT = {
  projectId: true,
  commandId: true,
  workItemId: true,
  actor: true,
  kind: true,
  requestHash: true,
  attemptId: true,
  workVersion: true,
  result: true,
} satisfies Prisma.WorkCommandSelect;

export type WorkRow = Prisma.WorkItemGetPayload<{ select: typeof WORK_ITEM_SELECT }>;
export type AttemptRow = Prisma.FixAttemptGetPayload<{ select: typeof FIX_ATTEMPT_SELECT }>;
export type CommandRow = Prisma.WorkCommandGetPayload<{ select: typeof WORK_COMMAND_SELECT }>;
