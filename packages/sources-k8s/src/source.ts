import { GraveshiftError } from '@graveshift/core';
import {
  envelopeBuilder,
  createDeliveryQueue,
  type Clock,
  type CollectorReads,
  type Context,
  type GraveHealth,
  type Integration,
  type Sleep,
  startWatchLoop,
  systemClock,
  validateContext,
} from '@graveshift/integrations';

import { mapK8sEventDetails } from './map-details';
import { serviceOf } from './map';
import { type DeploymentInfo, type KubeApi, WatchExpiredError } from './types';

export class K8sSourceError extends GraveshiftError<'SERVICE_NOT_FOUND'> {}

export interface K8sCollectorOptions {
  api: KubeApi;
  namespaces?: readonly string[];
  sleep?: Sleep;
  clock?: Clock;
}

export interface K8sCollector extends Integration, CollectorReads {}

export function createK8sCollector(options: K8sCollectorOptions): K8sCollector {
  const { api } = options;
  const clock = options.clock ?? systemClock;
  let lifetime: ReturnType<typeof startWatchLoop> | undefined;
  let delivery: ReturnType<typeof createDeliveryQueue> | undefined;
  let stopping: Promise<void> | undefined;
  let context: Context | undefined;
  let cursor: string | undefined;
  const seen = new Set<string>();
  const includes = (namespace: string) =>
    options.namespaces ? options.namespaces.includes(namespace) : !namespace.startsWith('kube-');
  const grave = (namespace: string, name: string) => {
    if (!context) throw new Error('Start the Kubernetes Collector before reading Graves');
    return `${context.service}__${namespace}__${name}`;
  };
  const deployments = async (): Promise<DeploymentInfo[]> =>
    (await api.listDeployments()).filter((deployment) => includes(deployment.namespace));
  const find = async (service: string): Promise<DeploymentInfo> => {
    const found = (await deployments()).find(
      (deployment) => grave(deployment.namespace, deployment.name) === service,
    );
    if (!found) throw new K8sSourceError('SERVICE_NOT_FOUND', `unknown service ${service}`);
    return found;
  };

  return {
    name: 'kubernetes',
    kind: 'collector',
    start(next: Context) {
      validateContext(next);
      if (lifetime || stopping) throw new Error('Kubernetes Collector is already active');
      if (context?.projectId !== next.projectId || context.service !== next.service) {
        cursor = undefined;
        seen.clear();
      }
      context = next;
      const queue = createDeliveryQueue(next.publisher, options.sleep);
      delivery = queue;
      lifetime = startWatchLoop({
        ...(options.sleep ? { sleep: options.sleep } : {}),
        notice: (notice) =>
          queue.notice(
            envelopeBuilder(
              next,
              clock,
            )({
              source: 'collector.k8s',
              type: notice.type,
              severity: 'info',
              traceId: clock.newId(),
              fingerprint: `${next.service}:${notice.type}`,
              payload: { ...notice },
            }),
          ),
        async connect(signal, connected) {
          cursor ??= await api.latestEventVersion();
          if (signal.aborted) return;
          const reader = new AbortController();
          const abort = () => reader.abort();
          signal.addEventListener('abort', abort, { once: true });
          let expired = false;
          try {
            await api.watchEvents(
              cursor,
              (event) => {
                if (reader.signal.aborted) return;
                const key = JSON.stringify([event.uid, event.resourceVersion]);
                if (seen.has(key) || queue.has(key)) return;
                const service = grave(event.namespace, serviceOf(event));
                const details = includes(event.namespace)
                  ? mapK8sEventDetails(event, service)
                  : null;
                const retained = queue.enqueue({
                  key,
                  async deliver(send, deliverySignal) {
                    if (!details) return;
                    const id = `${next.projectId}:${next.service}:${details.id}`;
                    const build = envelopeBuilder({ ...next, service }, clock);
                    await send(build({ ...details, id }));
                    if (
                      deliverySignal.aborted ||
                      details.type !== 'runtime.crash_loop' ||
                      event.involvedKind !== 'Pod'
                    )
                      return;
                    let oom: boolean;
                    try {
                      oom = await api.podOomKilled(event.namespace, event.involvedName);
                    } catch {
                      // Pod enrichment is best effort after the crash observation is acknowledged.
                      return;
                    }
                    if (!oom || deliverySignal.aborted) return;
                    await send(
                      build({
                        ...details,
                        id: `${id}:oom`,
                        type: 'runtime.oom',
                        fingerprint: `${service}:oom`,
                        payload: { ...details.payload, oomKilled: true },
                      }),
                    );
                  },
                  acknowledge() {
                    cursor = event.resourceVersion;
                    if (seen.size >= 1000) seen.delete(seen.values().next().value!);
                    seen.add(key);
                  },
                });
                // The push API has no pause operation. Replay any unretained frame after draining.
                if (!retained) reader.abort();
              },
              reader.signal,
              () => connected(cursor),
            );
          } catch (error) {
            expired = error instanceof WatchExpiredError;
            throw error;
          } finally {
            signal.removeEventListener('abort', abort);
            reader.abort();
            await queue.drain();
            // ponytail: a 410 resets after retained delivery, upgrade if historical replay is required.
            if (expired && !signal.aborted) cursor = undefined;
          }
        },
      });
    },
    async stop() {
      if (stopping) return stopping;
      if (!lifetime) return;
      stopping = Promise.all([lifetime.stop(), delivery?.stop()]).then(() => {});
      try {
        await stopping;
      } finally {
        lifetime = undefined;
        delivery = undefined;
        stopping = undefined;
      }
    },
    async listServices() {
      return (await deployments()).map((deployment) => ({
        name: grave(deployment.namespace, deployment.name),
        runtime: 'k8s' as const,
        namespace: deployment.namespace,
      }));
    },
    async tailLogs(service, lines) {
      const deployment = await find(service);
      const [pod] = await api.podNames(deployment.namespace, deployment.selector);
      if (!pod) return [];
      return (await api.readLog(deployment.namespace, pod, lines))
        .split('\n')
        .filter(Boolean)
        .slice(-lines);
    },
    async getHealth(service): Promise<GraveHealth> {
      const deployment = await find(service);
      let status: GraveHealth['status'] = 'unhealthy';
      if (deployment.replicas > 0 && deployment.ready >= deployment.replicas) status = 'healthy';
      else if (deployment.ready > 0) status = 'degraded';
      return {
        service,
        status,
        checkedAt: clock.now(),
        detail: `${deployment.ready}/${deployment.replicas} ready`,
      };
    },
  };
}
