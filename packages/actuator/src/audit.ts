import type { AuditDraft } from '@graveshift/core';

import type { ActionRequest, ActuationResult } from './types';

export function actionAudit(
  status: ActuationResult['status'] | 'admitted',
  reason: string,
  request?: ActionRequest,
  keyBase: string = crypto.randomUUID(),
): AuditDraft {
  return {
    key: `actuator:${keyBase}:${status === 'admitted' ? 'admission' : 'terminal'}`,
    actor: 'actuator',
    type: `actuator.${status}`,
    ...(request ? { incidentId: request.action.incidentId } : {}),
    payload: {
      reason,
      ...(request
        ? {
            actionId: request.action.id,
            service: request.action.service,
            runtime: request.action.runtime,
            kind: request.action.kind,
            ...(request.action.replicas === undefined ? {} : { replicas: request.action.replicas }),
            tokenId: request.approval.tokenId,
            approvedBy: request.approval.approvedBy,
          }
        : {}),
    },
  };
}
