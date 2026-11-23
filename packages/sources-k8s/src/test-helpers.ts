import type { EventEnvelope } from '@graveshift/core';
import type { Clock, Context } from '@graveshift/integrations';

import type { DeploymentInfo, K8sEvent, KubeApi } from './types';

export const clock: Clock = {
  now: () => '2026-11-20T10:00:00.000Z',
  newId: () => crypto.randomUUID(),
};
export const deployments: DeploymentInfo[] = [
  { name: 'api', namespace: 'shop', replicas: 2, ready: 2, selector: { app: 'api' } },
  { name: 'api', namespace: 'other', replicas: 1, ready: 0, selector: { app: 'other-api' } },
  { name: 'dns', namespace: 'kube-system', replicas: 1, ready: 1, selector: {} },
];
export const fixture = (overrides: Partial<K8sEvent> = {}): K8sEvent => ({
  uid: 'uid-1',
  reason: 'BackOff',
  message: 'Back-off restarting failed container',
  type: 'Warning',
  namespace: 'shop',
  involvedKind: 'Pod',
  involvedName: 'api-5d8f9c7b6d-x2k4q',
  resourceVersion: '101',
  at: clock.now(),
  ...overrides,
});

export function context(onPublish: (event: EventEnvelope) => void = () => {}) {
  const envelopes: EventEnvelope[] = [];
  const value: Context = {
    projectId: 'project-1',
    service: 'cluster',
    publisher: {
      async publish(envelope) {
        envelopes.push(envelope);
        onPublish(envelope);
      },
    },
  };
  return { value, envelopes };
}

export function fakeApi(streams: Array<K8sEvent[] | Error> = []) {
  const versions: string[] = [];
  const reads: string[] = [];
  const signals: AbortSignal[] = [];
  const api: KubeApi = {
    listDeployments: async () => deployments,
    podNames: async (namespace, selector) => {
      reads.push(`pods:${namespace}:${selector.app}`);
      return ['pod-1'];
    },
    podOomKilled: async () => true,
    readLog: async (namespace, pod, lines) => {
      reads.push(`logs:${namespace}:${pod}:${lines}`);
      return 'one\ntwo\nthree\n';
    },
    latestEventVersion: async () => '100',
    async watchEvents(version, onEvent, signal, onOpen) {
      versions.push(version);
      signals.push(signal);
      const next = streams.shift();
      if (next instanceof Error) throw next;
      onOpen();
      if (next) {
        for (const event of next) onEvent(event);
        return;
      }
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', () => resolve(), { once: true });
      });
    },
  };
  return { api, versions, reads, signals };
}
