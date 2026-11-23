import type { Prisma } from '@prisma/client';

export const AUDIT_SELECT = {
  seq: true,
  at: true,
  actor: true,
  type: true,
  incidentId: true,
  deploymentId: true,
  payload: true,
  prevHash: true,
  hash: true,
} satisfies Prisma.AuditEntrySelect;

export type AuditRow = Prisma.AuditEntryGetPayload<{ select: typeof AUDIT_SELECT }>;
