import type { Publisher } from '@graveshift/events';
import type { CollectorReads, Integration } from '@graveshift/integrations';
import {
  createMetricsClient,
  createPrometheusCollector,
  type MetricsClient,
} from '@graveshift/metrics';
import { createDockerCollector } from '@graveshift/sources-docker';
import { createK8sCollector, createKubeApi } from '@graveshift/sources-k8s';
import { z } from 'zod';
import { parseDaemonEnv } from './env';

const httpOrigin = z.url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
});
const parseJson = (value: unknown) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};
const CollectorEnvSchema = z.object({
  GRAVESHIFT_COLLECTOR_SERVICE: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .default('host'),
  GRAVESHIFT_DOCKER_URL: httpOrigin.optional(),
  GRAVESHIFT_K8S_ENABLED: z.enum(['true', 'false']).default('false'),
  GRAVESHIFT_K8S_NAMESPACES: z.preprocess(parseJson, z.array(z.string().min(1)).optional()),
  GRAVESHIFT_PROMETHEUS_URL: httpOrigin.optional(),
  GRAVESHIFT_METRIC_TARGETS: z.preprocess(
    parseJson,
    z
      .array(
        z
          .object({ service: z.string().regex(/^[A-Za-z0-9_-]+$/), job: z.string().min(1) })
          .strict(),
      )
      .default([]),
  ),
});

export interface Collectors {
  integrations: readonly Integration[];
  reads: readonly CollectorReads[];
  metrics?: MetricsClient;
  metricJobs: readonly string[];
  start(projectId: string, publisher: Publisher): Promise<void>;
  stop(): Promise<void>;
}

export function createCollectors(env: Record<string, string | undefined>): Collectors {
  const config = parseDaemonEnv(CollectorEnvSchema, env, 'Collector configuration is invalid');
  const integrations: Integration[] = [];
  const reads: CollectorReads[] = [];
  if (config.GRAVESHIFT_DOCKER_URL !== undefined) {
    const docker = createDockerCollector({ baseUrl: config.GRAVESHIFT_DOCKER_URL });
    integrations.push(docker);
    reads.push(docker);
  }
  if (config.GRAVESHIFT_K8S_ENABLED === 'true') {
    const kubernetes = createK8sCollector({
      api: createKubeApi(),
      ...(config.GRAVESHIFT_K8S_NAMESPACES === undefined
        ? {}
        : { namespaces: config.GRAVESHIFT_K8S_NAMESPACES }),
    });
    integrations.push(kubernetes);
    reads.push(kubernetes);
  }
  const metrics =
    config.GRAVESHIFT_PROMETHEUS_URL === undefined
      ? undefined
      : createMetricsClient(config.GRAVESHIFT_PROMETHEUS_URL);
  if (metrics !== undefined) {
    if (config.GRAVESHIFT_METRIC_TARGETS.length === 0)
      throw new Error('Prometheus needs configured metric targets');
    integrations.push(
      createPrometheusCollector({ client: metrics, targets: config.GRAVESHIFT_METRIC_TARGETS }),
    );
  }
  const started = new Set<Integration>();
  const stop = async () => {
    const results = await Promise.allSettled(
      [...started].reverse().map((integration) => integration.stop()),
    );
    started.clear();
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('Collector shutdown failed');
  };
  return {
    integrations,
    reads,
    ...(metrics === undefined ? {} : { metrics }),
    metricJobs: config.GRAVESHIFT_METRIC_TARGETS.map((target) => target.job),
    async start(projectId, publisher) {
      try {
        await integrations.reduce(
          (chain, integration) =>
            chain.then(async () => {
              started.add(integration);
              await integration.start({
                projectId,
                service: config.GRAVESHIFT_COLLECTOR_SERVICE,
                publisher,
              });
            }),
          Promise.resolve(),
        );
      } catch {
        await stop();
        throw new Error('Collector startup failed');
      }
    },
    stop,
  };
}
