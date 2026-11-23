import { AppsV1Api, KubeConfig, PatchStrategy, setHeaderOptions } from '@kubernetes/client-node';
import { z } from 'zod';

import * as types from './types';

const ContainersSchema = z.array(z.object({ Id: z.string().min(1) }));

// Docker is reached through a docker-socket-proxy that allows restarts only (SEC-1)
export function createDockerRestarter(
  baseUrl: string,
  fetchFn: types.HttpFetch = fetch,
): types.DockerRestarter {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) {
    throw new types.ActuatorError(
      'ACTUATOR_CONFIG',
      'Docker must be reached through the socket-proxy HTTP URL',
    );
  }
  return {
    async restart(service) {
      const filters = JSON.stringify({ label: [`com.docker.compose.service=${service}`] });
      const list = await fetchFn(
        new URL(`/containers/json?filters=${encodeURIComponent(filters)}`, base),
      );
      if (!list.ok)
        throw new types.ActuatorError(
          'ACTUATOR_BACKEND',
          `container lookup responded ${list.status}`,
        );
      const parsed = ContainersSchema.safeParse(await list.json());
      if (!parsed.success) {
        throw new types.ActuatorError('ACTUATOR_BACKEND', 'container lookup returned invalid data');
      }
      const containers = parsed.data;
      if (containers.length === 0)
        throw new types.ActuatorError('ACTUATOR_BACKEND', `no container for ${service}`);
      await Promise.all(
        containers.map(async ({ Id }) => {
          const res = await fetchFn(
            new URL(`/containers/${encodeURIComponent(Id)}/restart?t=10`, base),
            { method: 'POST' },
          );
          if (!res.ok)
            throw new types.ActuatorError('ACTUATOR_BACKEND', `restart responded ${res.status}`);
        }),
      );
    },
  };
}

// graveshift-actuator RBAC: patch api/worker deployments, scale worker only
export function createKubeWriter(
  kc: KubeConfig = inCluster(),
  now: () => Date = () => new Date(),
): types.KubeWriter {
  const apps = kc.makeApiClient(AppsV1Api);
  return {
    async rolloutRestart(namespace, name) {
      await apps.patchNamespacedDeployment(
        {
          name,
          namespace,
          body: {
            spec: {
              template: {
                metadata: {
                  annotations: { 'kubectl.kubernetes.io/restartedAt': now().toISOString() },
                },
              },
            },
          },
        },
        setHeaderOptions('Content-Type', PatchStrategy.StrategicMergePatch),
      );
    },
    async scale(namespace, name, replicas) {
      await apps.patchNamespacedDeploymentScale(
        { name, namespace, body: { spec: { replicas } } },
        setHeaderOptions('Content-Type', PatchStrategy.MergePatch),
      );
    },
  };
}

function inCluster(): KubeConfig {
  const kc = new KubeConfig();
  kc.loadFromCluster();
  return kc;
}
