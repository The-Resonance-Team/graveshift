import {
  GraveshiftError,
  type RuntimeSource,
  type ServiceHealth,
  type ServiceInfo,
} from '@graveshift/core';

import { mapK8sEvent, serviceOf } from './map';
import { type DeploymentInfo, type KubeApi, WatchExpiredError } from './types';
import { type Sleep, startWatchLoop } from './watch';

export class K8sSourceError extends GraveshiftError<'SERVICE_NOT_FOUND'> {}

export interface K8sSourceOptions {
  api: KubeApi;
  sleep?: Sleep;
  now?: () => Date;
}

export function createK8sSource({
  api,
  sleep,
  now = () => new Date(),
}: K8sSourceOptions): RuntimeSource {
  const stops = new Set<() => void>();
  let cursor: string | undefined;
  const seen = new Set<string>();

  // ponytail: kube-* namespaces are skipped, upgrade to a configured namespace list if needed
  const deployments = async (): Promise<DeploymentInfo[]> =>
    (await api.listDeployments()).filter((d) => !d.namespace.startsWith('kube-'));

  const find = async (service: string): Promise<DeploymentInfo> => {
    const found = (await deployments()).find((d) => d.name === service);
    if (!found) throw new K8sSourceError('SERVICE_NOT_FOUND', `unknown service ${service}`);
    return found;
  };

  return {
    async listServices(): Promise<ServiceInfo[]> {
      return (await deployments()).map((d) => ({
        name: d.name,
        runtime: 'k8s' as const,
        namespace: d.namespace,
      }));
    },

    async watchEvents(cb) {
      const stop = startWatchLoop({
        emit: cb,
        now,
        ...(sleep ? { sleep } : {}),
        async connect(signal, connected) {
          // ponytail: after a 410 Gone the gap is not replayed, upgrade if lost events matter
          cursor ??= await api.latestEventVersion();
          try {
            await api.watchEvents(
              cursor,
              (event) => {
                if (seen.has(event.uid + event.resourceVersion)) return;
                if (seen.size > 1000) seen.clear();
                seen.add(event.uid + event.resourceVersion);
                cursor = event.resourceVersion;
                const mapped = mapK8sEvent(event);
                if (!mapped) return;
                cb({ kind: 'signal', cursor: event.resourceVersion, signal: mapped });
                if (mapped.kind === 'crash_loop') void emitOom(event, mapped, cb);
              },
              signal,
              () => connected(cursor),
            );
          } catch (error) {
            if (error instanceof WatchExpiredError) cursor = undefined;
            throw error;
          }
        },
      });

      const emitOom = async (
        event: Parameters<typeof mapK8sEvent>[0],
        crash: NonNullable<ReturnType<typeof mapK8sEvent>>,
        emit: Parameters<RuntimeSource['watchEvents']>[0],
      ) => {
        try {
          if (
            event.involvedKind !== 'Pod' ||
            !(await api.podOomKilled(event.namespace, event.involvedName))
          )
            return;
          emit({
            kind: 'signal',
            cursor: event.resourceVersion,
            signal: {
              ...crash,
              id: `${crash.id}:oom`,
              kind: 'oom',
              fingerprint: `${serviceOf(event)}:oom`,
            },
          });
        } catch {
          // enrichment is best-effort; the crash_loop signal was already delivered
        }
      };

      stops.add(stop);
      return () => {
        stop();
        stops.delete(stop);
      };
    },

    async tailLogs(service, lines) {
      const d = await find(service);
      const [pod] = await api.podNames(d.namespace, d.selector);
      if (!pod) return [];
      const text = await api.readLog(d.namespace, pod, lines);
      return text
        .split('\n')
        .filter((line) => line !== '')
        .slice(-lines);
    },

    async getHealth(service): Promise<ServiceHealth> {
      const d = await find(service);
      let status: ServiceHealth['status'] = 'unhealthy';
      if (d.replicas > 0 && d.ready >= d.replicas) status = 'healthy';
      else if (d.ready > 0) status = 'degraded';
      return {
        service,
        status,
        checkedAt: now().toISOString(),
        detail: `${d.ready}/${d.replicas} ready`,
      };
    },

    async close() {
      for (const stop of stops) stop();
      stops.clear();
    },
  };
}
