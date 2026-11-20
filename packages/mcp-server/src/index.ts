import { createMetricsClient } from '@graveshift/metrics';
import { loadPolicy } from '@graveshift/policy';

import { createDaemonBackend } from './backend';
import { createHandler } from './protocol';
import { serveStdio } from './transports';

export const PACKAGE_NAME = '@graveshift/mcp-server';
export { createDaemonBackend } from './backend';
export type { Backend, IncidentView } from './backend';
export { checkPromql } from './promql';
export { createHandler } from './protocol';
export { createHttpHandler, serveStdio } from './transports';
export type { ToolDeps } from './tools';

if (import.meta.main) {
  const env = process.env;
  const metrics = env.PROMETHEUS_URL ? createMetricsClient(env.PROMETHEUS_URL) : undefined;
  const backend = createDaemonBackend(env.DAEMON_URL ?? 'http://127.0.0.1:3000', fetch, metrics);
  const policy = await loadPolicy(env.POLICY_PATH ?? 'policy.yaml');
  const handle = createHandler({
    backend,
    policy,
    ...(env.GRAVESHIFT_MODE ? { envMode: env.GRAVESHIFT_MODE } : {}),
  });
  if (env.GRAVESHIFT_MCP_HTTP_PORT && env.GRAVESHIFT_MCP_TOKEN) {
    const { createHttpHandler } = await import('./transports');
    Bun.serve({
      port: Number(env.GRAVESHIFT_MCP_HTTP_PORT),
      fetch: createHttpHandler(handle, env.GRAVESHIFT_MCP_TOKEN),
    });
  }
  await serveStdio(handle);
}
