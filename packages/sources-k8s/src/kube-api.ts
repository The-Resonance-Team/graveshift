import { AppsV1Api, CoreV1Api, type CoreV1Event, KubeConfig, Watch } from '@kubernetes/client-node';

import { type DeploymentInfo, type K8sEvent, type KubeApi, WatchExpiredError } from './types';

const toEvent = (e: CoreV1Event): K8sEvent => ({
  uid: e.metadata?.uid ?? '',
  reason: e.reason ?? '',
  message: e.message ?? '',
  type: e.type ?? '',
  namespace: e.metadata?.namespace ?? '',
  involvedKind: e.involvedObject.kind ?? '',
  involvedName: e.involvedObject.name ?? '',
  resourceVersion: e.metadata?.resourceVersion ?? '',
  at: (e.lastTimestamp ?? e.eventTime ?? e.metadata?.creationTimestamp ?? new Date()).toISOString(),
});

const labelSelector = (selector: Record<string, string>) =>
  Object.entries(selector)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');

// graveshift-reader RBAC: get/list/watch on pods, pods/log, events, deployments only.
export function createKubeApi(kc: KubeConfig = inCluster()): KubeApi {
  const core = kc.makeApiClient(CoreV1Api);
  const apps = kc.makeApiClient(AppsV1Api);
  const watch = new Watch(kc);

  return {
    async listDeployments(): Promise<DeploymentInfo[]> {
      const list = await apps.listDeploymentForAllNamespaces();
      return list.items.map((d) => ({
        name: d.metadata?.name ?? '',
        namespace: d.metadata?.namespace ?? '',
        replicas: d.status?.replicas ?? 0,
        ready: d.status?.readyReplicas ?? 0,
        selector: d.spec?.selector.matchLabels ?? {},
      }));
    },

    async podNames(namespace, selector) {
      const pods = await core.listNamespacedPod({
        namespace,
        labelSelector: labelSelector(selector),
      });
      return pods.items.map((p) => p.metadata?.name ?? '').filter(Boolean);
    },

    async podOomKilled(namespace, pod) {
      const found = await core.readNamespacedPod({ namespace, name: pod });
      return (found.status?.containerStatuses ?? []).some(
        (s) => s.lastState?.terminated?.reason === 'OOMKilled',
      );
    },

    readLog: (namespace, pod, lines) =>
      core.readNamespacedPodLog({ namespace, name: pod, tailLines: lines }),

    async latestEventVersion() {
      const list = await core.listEventForAllNamespaces({ limit: 1 });
      return list.metadata?.resourceVersion ?? '';
    },

    async watchEvents(resourceVersion, onEvent, signal, onOpen) {
      const done = Promise.withResolvers<void>();
      const controller = await watch.watch(
        '/api/v1/events',
        { resourceVersion, allowWatchBookmarks: true },
        (phase, obj: CoreV1Event) => {
          if (phase === 'ADDED' || phase === 'MODIFIED') onEvent(toEvent(obj));
        },
        (error: { statusCode?: number; code?: number; message?: string } | null) => {
          const expired =
            error?.statusCode === 410 ||
            error?.code === 410 ||
            /410|too old/i.test(error?.message ?? '');
          if (expired) done.reject(new WatchExpiredError());
          else if (error)
            done.reject(
              error instanceof Error ? error : new Error(error.message ?? 'watch failed'),
            );
          else done.resolve();
        },
      );
      onOpen();
      signal.addEventListener('abort', () => controller.abort(), { once: true });
      await done.promise;
    },
  };
}

function inCluster(): KubeConfig {
  const kc = new KubeConfig();
  kc.loadFromCluster();
  return kc;
}
