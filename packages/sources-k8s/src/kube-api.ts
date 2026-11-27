import { AppsV1Api, CoreV1Api, KubeConfig, Watch } from '@kubernetes/client-node';
import { z } from 'zod';

import { type DeploymentInfo, type K8sEvent, type KubeApi, WatchExpiredError } from './types';

const timestamp = z.union([z.iso.datetime(), z.date().transform((date) => date.toISOString())]);
const eventSchema = z.object({
  metadata: z.object({
    uid: z.string().min(1),
    namespace: z.string().default(''),
    resourceVersion: z.string().min(1),
    creationTimestamp: timestamp.nullish(),
  }),
  involvedObject: z.object({ kind: z.string(), name: z.string() }),
  reason: z.string().default(''),
  message: z.string().default(''),
  type: z.string().default(''),
  lastTimestamp: timestamp.nullish(),
  eventTime: timestamp.nullish(),
});
const expiredSchema = z.object({ code: z.literal(410) });

function toEvent(input: unknown): K8sEvent | undefined {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return;
  const event = parsed.data;
  return {
    uid: event.metadata.uid,
    reason: event.reason,
    message: event.message,
    type: event.type,
    namespace: event.metadata.namespace,
    involvedKind: event.involvedObject.kind,
    involvedName: event.involvedObject.name,
    resourceVersion: event.metadata.resourceVersion,
    at:
      event.lastTimestamp ??
      event.eventTime ??
      event.metadata.creationTimestamp ??
      new Date().toISOString(),
  };
}

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
      if (signal.aborted) return;
      const done = Promise.withResolvers<void>();
      void done.promise.catch(() => {});
      let controller: AbortController | undefined;
      const abort = () => {
        controller?.abort();
        done.resolve();
      };
      signal.addEventListener('abort', abort, { once: true });
      try {
        controller = await watch.watch(
          '/api/v1/events',
          { resourceVersion, allowWatchBookmarks: true },
          (phase, obj: unknown) => {
            if (signal.aborted) return;
            if (phase === 'ERROR') {
              done.reject(
                expiredSchema.safeParse(obj).success
                  ? new WatchExpiredError()
                  : new Error('Kubernetes watch error'),
              );
            } else if (phase === 'ADDED' || phase === 'MODIFIED') {
              const event = toEvent(obj);
              if (event) onEvent(event);
            }
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
        if (signal.aborted) {
          controller.abort();
          return;
        }
        onOpen();
        await done.promise;
      } finally {
        signal.removeEventListener('abort', abort);
        controller?.abort();
      }
    },
  };
}

function inCluster(): KubeConfig {
  const kc = new KubeConfig();
  kc.loadFromCluster();
  return kc;
}
