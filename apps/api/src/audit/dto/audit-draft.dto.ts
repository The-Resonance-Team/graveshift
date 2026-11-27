import type { AuditDraft } from '@graveshift/core';
import { Allow } from 'class-validator';

/** The envelope validates these fields with the canonical AuditDraftSchema. */
export class AuditDraftDto implements AuditDraft {
  @Allow()
  key!: string;

  @Allow()
  actor!: string;

  @Allow()
  type!: string;

  @Allow()
  incidentId?: string | undefined;

  @Allow()
  payload!: AuditDraft['payload'];
}
