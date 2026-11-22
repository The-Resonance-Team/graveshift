import { AuditDraftSchema, AuditEntrySchema } from '@graveshift/core';
import { z } from 'zod';

import type { AuditRow } from './audit.select';
import { canonical } from './chain';

const payloadSchema = z.record(z.string(), z.json());

export function normalizeDraft(input: unknown) {
  const draft = AuditDraftSchema.parse(input);
  return {
    ...draft,
    payload: payloadSchema.parse(JSON.parse(JSON.stringify(draft.payload))),
  };
}

export function toAuditEntry(row: AuditRow) {
  const { incidentId, ...entry } = row;
  return AuditEntrySchema.parse({
    ...entry,
    at: row.at.toISOString(),
    ...(incidentId === null ? {} : { incidentId }),
  });
}

export function auditFacts(draft: Omit<ReturnType<typeof AuditDraftSchema.parse>, 'key'>) {
  return canonical([draft.actor, draft.type, draft.incidentId ?? null, draft.payload]);
}
