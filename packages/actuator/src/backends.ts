import { AppsV1Api, KubeConfig, PatchStrategy, setHeaderOptions } from '@kubernetes/client-node';

import { ActuatorError, type DockerRestarter, type KubeWriter } from './types';

// Docker is reached through a docker-socket-proxy that allows restarts only (SEC-1)
export function createDockerRestarter(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
): DockerRestarter {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) {
    throw new ActuatorError(
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
        throw new ActuatorError('ACTUATOR_BACKEND', `container lookup responded ${list.status}`);
      const containers = (await list.json()) as Array<{ Id: string }>;
      if (containers.length === 0)
        throw new ActuatorError('ACTUATOR_BACKEND', `no container for ${service}`);
      await Promise.all(
        containers.map(async ({ Id }) => {
          const res = await fetchFn(
            new URL(`/containers/${encodeURIComponent(Id)}/restart?t=10`, base),
            { method: 'POST' },
          );
          if (!res.ok)
            throw new ActuatorError('ACTUATOR_BACKEND', `restart responded ${res.status}`);
        }),
      );
    },
  };
}

// graveshift-actuator RBAC: patch api/worker deployments, scale worker only
export function createKubeWriter(
  kc: KubeConfig = inCluster(),
  now: () => Date = () => new Date(),
): KubeWriter {
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
