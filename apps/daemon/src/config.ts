import { type Mode, type Policy, resolveMode } from '@graveshift/policy';

export type Env = Record<string, string | undefined>;

export interface DaemonConfig {
  port: number;
  dataDir: string;
  policyPath: string;
  configPath: string;
  dockerProxyUrl?: string;
  prometheusUrl?: string;
  metricsTargets: Array<{ service: string; job: string }>;
  haunt?: { apiUrl: string; workerUrl: string; token: string };
  logPollMs: number;
  healthPollMs: number;
}

// "api=demo-api,worker=demo-worker" -> targets for the PromQL poller
const parseTargets = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((pair) => pair.split('='))
    .filter(
      (pair): pair is [string, string] => pair.length === 2 && pair.every((p) => p.trim() !== ''),
    )
    .map(([service, job]) => ({ service: service.trim(), job: job.trim() }));

export function readConfig(env: Env): DaemonConfig {
  return {
    port: Number(env.PORT ?? 3000),
    dataDir: env.DATA_DIR ?? './data',
    policyPath: env.POLICY_PATH ?? 'policy.yaml',
    configPath: env.CONFIG_PATH ?? 'graveshift.config.yaml',
    ...(env.DOCKER_PROXY_URL ? { dockerProxyUrl: env.DOCKER_PROXY_URL } : {}),
    ...(env.PROMETHEUS_URL ? { prometheusUrl: env.PROMETHEUS_URL } : {}),
    metricsTargets: parseTargets(env.METRICS_TARGETS ?? 'api=demo-api'),
    ...(env.HAUNT_TOKEN
      ? {
          haunt: {
            apiUrl: env.DEMO_API_URL ?? 'http://api:3000',
            workerUrl: env.DEMO_WORKER_URL ?? 'http://worker:3001',
            token: env.HAUNT_TOKEN,
          },
        }
      : {}),
    logPollMs: Number(env.LOG_POLL_MS ?? 5000),
    healthPollMs: Number(env.HEALTH_POLL_MS ?? 10_000),
  };
}

export function modeView(
  policy: Policy,
  env: Env,
): { policy: Mode; effective: Mode; warning?: string } {
  const { mode, warning } = resolveMode(policy.mode, env.GRAVESHIFT_MODE);
  return { policy: policy.mode, effective: mode, ...(warning ? { warning } : {}) };
}
