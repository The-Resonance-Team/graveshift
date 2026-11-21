import type { Signal } from '@graveshift/core';

import type { K8sEvent } from './types';

export function serviceOf(event: K8sEvent): string {
  if (event.involvedKind !== 'Pod') return event.involvedName;
  return event.involvedName.replace(/^(.+)-[a-z0-9]{8,10}-[a-z0-9]{5}$/, '$1');
}

function kindOf(event: K8sEvent): Signal['kind'] | undefined {
  const { reason, message } = event;
  if (reason === 'OOMKilling') return 'oom';
  if (reason === 'BackOff' && message.includes('Back-off restarting failed container'))
    return 'crash_loop';
  if (
    reason === 'ErrImagePull' ||
    reason === 'ImagePullBackOff' ||
    (reason === 'BackOff' && message.includes('Back-off pulling image')) ||
    (reason === 'Failed' && /ErrImagePull|ImagePullBackOff|Failed to pull image/.test(message))
  ) {
    return 'image_pull_backoff';
  }
  if (reason === 'Unhealthy') return 'unhealthy';
  if (reason === 'Killing' && message.includes('failed liveness probe')) return 'restart';
  return undefined;
}

export function mapK8sEvent(event: K8sEvent): Signal | null {
  const kind = kindOf(event);
  if (!kind || event.type !== 'Warning') return null;
  const service = serviceOf(event);
  return {
    id: `k8s:${event.uid}:${event.resourceVersion}`,
    service,
    kind,
    severity: kind === 'oom' || kind === 'crash_loop' ? 'critical' : 'warning',
    source: 'k8s',
    fingerprint: `${service}:${kind}`,
    message: `${event.involvedKind}/${event.involvedName} ${event.reason}: ${event.message}`,
    observedAt: event.at,
  };
}
