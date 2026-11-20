import type { Signal } from '@graveshift/core';

import type { DockerEvent } from './api';

export function mapDockerEvent(event: DockerEvent, service: string): Signal | null {
  const attrs = event.Actor.Attributes;
  let kind: Signal['kind'] | undefined;
  let severity: Signal['severity'] = 'warning';
  if (event.Action === 'oom') {
    kind = 'oom';
    severity = 'critical';
  } else if (event.Action === 'die' && attrs.exitCode !== undefined && attrs.exitCode !== '0') {
    kind = 'restart';
  } else if (event.Action === 'health_status: unhealthy') {
    kind = 'unhealthy';
  }
  if (!kind) return null;
  return {
    id: `docker:${event.Actor.ID}:${event.timeNano ?? event.time}:${kind}`,
    service,
    kind,
    severity,
    source: 'docker',
    fingerprint: `${service}:${kind}`,
    message: `container ${attrs.name ?? event.Actor.ID} ${event.Action}${attrs.exitCode ? ` exitCode=${attrs.exitCode}` : ''}`,
    observedAt: new Date(event.time * 1000).toISOString(),
  };
}
