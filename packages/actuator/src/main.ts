import { loadPolicy } from '@graveshift/policy';

import { createDockerRestarter, createKubeWriter } from './backends';
import { createActuator } from './execute';
import { MIN_SECRET_LENGTH } from './sign';
import { ActuatorError, type KubeWriter } from './types';

const env = process.env;
const log = (level: string, msg: string, extra: Record<string, unknown> = {}) =>
  process.stdout.write(
    `${JSON.stringify({ level, msg, time: new Date().toISOString(), ...extra })}\n`,
  );

const secret = env.ACTUATOR_HMAC_SECRET ?? '';
if (secret.length < MIN_SECRET_LENGTH) {
  log(
    'fatal',
    `ACTUATOR_HMAC_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters; refusing to start`,
  );
  process.exit(1);
}

const unavailable = (what: string): never => {
  throw new ActuatorError('ACTUATOR_BACKEND', `${what} is not configured for this actuator`);
};
const kube: KubeWriter = env.KUBERNETES_SERVICE_HOST
  ? createKubeWriter()
  : {
      rolloutRestart: async () => unavailable('kubernetes'),
      scale: async () => unavailable('kubernetes'),
    };

const actuator = createActuator({
  secret,
  policy: await loadPolicy(env.POLICY_PATH ?? 'policy.yaml'),
  namespace: env.TARGET_NAMESPACE ?? 'candy-shop',
  docker: env.DOCKER_PROXY_URL
    ? createDockerRestarter(env.DOCKER_PROXY_URL)
    : { restart: async () => unavailable('docker') },
  kube,
});

const MAX_BODY = 16 * 1024;

const server = Bun.serve({
  port: Number(env.PORT ?? 3200),
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (req.method === 'GET' && pathname === '/healthz') return Response.json({ status: 'ok' });
    if (req.method !== 'POST' || pathname !== '/actions')
      return Response.json({ error: 'not found' }, { status: 404 });
    const text = await req.text();
    if (text.length > MAX_BODY) return Response.json({ error: 'too large' }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    const result = await actuator.execute(body);
    // ponytail: audit events go to stdout, upgrade by posting them to the daemon's audit chain once that endpoint exists
    log(result.status === 'executed' ? 'info' : 'warn', 'actuation', { audit: result.audit });
    const status = result.status === 'executed' ? 200 : result.status === 'denied' ? 403 : 502;
    return Response.json({ status: result.status, reason: result.reason }, { status });
  },
});
log('info', 'actuator listening', { port: server.port });
