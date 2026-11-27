import type { EventDetails } from '@graveshift/integrations';

import type { DockerEvent } from './api';
import { mapDockerEvent } from './map';

/**
 * Architecture mapper: one Docker event becomes one envelope EventDetails.
 * It reuses the base Signal classification so both APIs stay in step, while
 * the event-specific fields follow the privacy envelope vocabulary.
 */
export function mapDockerEventDetails(event: DockerEvent, service: string): EventDetails | null {
  const signal = mapDockerEvent(event, service);
  if (!signal) return null;
  const stamp = event.timeNano ?? event.time;
  return {
    id: signal.id,
    type: `runtime.${signal.kind}`,
    severity: signal.severity,
    source: 'collector.docker',
    traceId: `docker:${event.Actor.ID}:${stamp}`,
    fingerprint: signal.fingerprint,
    payload: {
      message: signal.message,
      containerId: event.Actor.ID,
      action: event.Action,
    },
    observedAt: signal.observedAt,
  };
}
