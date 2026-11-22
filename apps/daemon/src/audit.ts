import { AuditDraftSchema, type AuditDraft } from '@graveshift/core';
import type { AuditSink } from '@graveshift/gateway';
import { z } from 'zod';

import type { PrivateApi } from './api-client';
import { modelContext } from './model-context';

export type WriteAudit = (draft: AuditDraft) => Promise<void>;

export function createAudit(api: PrivateApi, projectId: string): WriteAudit {
  return async (input) => {
    const draft = AuditDraftSchema.parse(input);
    const ack = await api.post(
      '/internal/audit',
      { projectId, draft },
      z.object({ key: z.string().min(1) }).strict(),
    );
    if (ack.key !== draft.key) throw new Error('Audit acknowledgement does not match');
  };
}

export function gatewayAudit(write: WriteAudit): AuditSink {
  return async (event) => {
    const context = modelContext();
    await write({
      key: `gateway:${event.callId}`,
      actor: event.agent,
      type: 'model.call',
      ...(context === undefined ? {} : { incidentId: context.incidentId }),
      payload: { ...event, ...(context === undefined ? {} : { service: context.service }) },
    });
    return { callId: event.callId };
  };
}
