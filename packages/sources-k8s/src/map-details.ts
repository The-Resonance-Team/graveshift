import type { EventDetails } from '@graveshift/integrations';

import { mapK8sEvent } from './map';
import type { K8sEvent } from './types';

/**
 * Architecture mapper: one Kubernetes event becomes one envelope EventDetails.
 * It reuses the base Signal classification so both APIs stay in step. The
 * caller supplies the Grave service, which is the envelope fingerprint scope.
 */
export function mapK8sEventDetails(event: K8sEvent, service: string): EventDetails | null {
  const signal = mapK8sEvent(event);
  if (!signal) return null;
  return {
    id: signal.id,
    type: `runtime.${signal.kind}`,
    severity: signal.severity,
    source: 'collector.k8s',
    traceId: `k8s:${event.uid}:${event.resourceVersion}`,
    fingerprint: `${service}:${signal.kind}`,
    payload: {
      message: signal.message,
      namespace: event.namespace,
      resource: event.involvedName,
      reason: event.reason,
    },
    observedAt: signal.observedAt,
  };
}
