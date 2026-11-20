import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';

import { loadConfigFile, type RuntimeSource } from '@graveshift/core';
import { diagnose } from '@graveshift/diagnoser';
import { buildProviders, createGateway, type LlmConfig, LlmConfigSchema } from '@graveshift/llm';
import { createMetricsClient } from '@graveshift/metrics';
import { loadPolicy } from '@graveshift/policy';
import { redact } from '@graveshift/redactor';
import { createDockerSource } from '@graveshift/sources-docker';
import { createK8sSource, createKubeApi } from '@graveshift/sources-k8s';
import { createSqliteAuditStore } from '@graveshift/store';
import { createPoller, createWatcher } from '@graveshift/watcher';
import pino from 'pino';

import { modeView, readConfig } from './config';
import { startFeeders } from './feeders';
import { createFlow } from './flow';
import { createHttp } from './http';
import { createRegistry } from './registry';

const log = pino({ base: { app: 'graveshift-daemon' } });
const warn = (message: string) => log.warn(redact(message));
const env = process.env;
const config = readConfig(env);

const policy = await loadPolicy(config.policyPath);
const mode = modeView(policy, env);
if (mode.warning) warn(mode.warning);

const llmConfig: LlmConfig | undefined = await loadConfigFile(config.configPath)
  .then((c) => LlmConfigSchema.parse(c.llm))
  .catch(() => undefined);
if (!llmConfig) warn(`no LLM config at ${config.configPath}, diagnoses are rules-only`);
const gateway = createGateway({
  providers: llmConfig ? buildProviders(llmConfig, env) : [],
  config: llmConfig ?? { timeoutMs: 30_000, maxRetries: 0, priceTableUsdPer1M: {} },
  dailyBudgetUsd: policy.limits.llmDailyBudgetUsd,
  onAudit: (event) => log.info({ llm: event }, 'llm call'),
});

mkdirSync(config.dataDir, { recursive: true });
const audit = createSqliteAuditStore(new Database(`${config.dataDir}/audit.db`, { create: true }));

const runtime: RuntimeSource = config.dockerProxyUrl
  ? createDockerSource({ baseUrl: config.dockerProxyUrl })
  : createK8sSource({ api: createKubeApi() });

const watched = new Set(
  (env.WATCH_SERVICES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
// the graveyard and every poller only see WATCH_SERVICES when it is set
const source: RuntimeSource = {
  listServices: async () =>
    (await runtime.listServices()).filter((s) => watched.size === 0 || watched.has(s.name)),
  watchEvents: (cb) => runtime.watchEvents(cb),
  tailLogs: (service, lines) => runtime.tailLogs(service, lines),
  getHealth: (service) => runtime.getHealth(service),
  close: () => runtime.close(),
};
const services = async () => (await source.listServices()).map((s) => s.name);

const registry = createRegistry();
const flow = createFlow({
  registry,
  audit,
  policy,
  ...(env.GRAVESHIFT_MODE ? { envMode: env.GRAVESHIFT_MODE } : {}),
  diagnose: (input) => diagnose({ gateway }, input),
  tailLogs: (service) => source.tailLogs(service, 300),
  warn,
});
const watcher = createWatcher({
  onOutcome: (outcome) => {
    if (watched.size > 0 && !watched.has(outcome.detection.service)) return;
    void flow.onOutcome(outcome);
  },
});

await source.watchEvents((event) => {
  if (event.kind === 'signal') watcher.ingest(event);
  else warn(`runtime source ${event.kind}`);
});
startFeeders({
  source,
  watcher,
  services,
  logPollMs: config.logPollMs,
  healthPollMs: config.healthPollMs,
  warn,
});
if (config.prometheusUrl) {
  createPoller({
    client: createMetricsClient(config.prometheusUrl),
    watcher,
    targets: config.metricsTargets,
    warn,
  }).start();
}

const handle = createHttp({
  registry,
  audit,
  source,
  mode,
  ...(config.haunt ? { haunt: config.haunt } : {}),
  heartbeatMs: 5000,
});
const server = Bun.serve({ port: config.port, idleTimeout: 30, fetch: handle });
log.info(
  { port: server.port, mode: mode.effective, runtime: config.dockerProxyUrl ? 'docker' : 'k8s' },
  'daemon listening',
);
