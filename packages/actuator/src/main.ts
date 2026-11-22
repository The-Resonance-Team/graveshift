import { loadGraveshiftConfig } from '@graveshift/config';

import { createDockerRestarter, createKubeWriter } from './backends';
import { createAdmissionHttp } from './audit-http';
import { createActuator } from './execute';
import { createActionHandler, MAX_ACTION_BODY_BYTES } from './handler';
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

const apiUrl = env.GRAVESHIFT_API_URL ?? 'http://127.0.0.1:3000';
const internalToken = env.GRAVESHIFT_API_INTERNAL_TOKEN ?? '';
// Durable admission binds to the stored deployment grant. There is no host-wide
// Project env value. The API checks this id against the same grant.
const bootResponse = await fetch(new URL('/internal/config', apiUrl), {
  headers: { authorization: `Bearer ${internalToken}` },
  signal: AbortSignal.timeout(5_000),
});
if (!bootResponse.ok) {
  log('fatal', 'Internal configuration is unavailable; refusing to start');
  process.exit(1);
}
const boot = (await bootResponse.json()) as { projectIds?: string[] };
const auditConfig = {
  apiUrl,
  token: internalToken,
  projectId: boot.projectIds?.[0] ?? '',
};
// ponytail: the actuator has no authenticated Project context in the signed
// action request, so it must not append to an arbitrary Project audit chain.
// Keep audit acknowledgement local; restore the createAuditHttp durable append
// when the actuator receives a signed projectId in the action claim.
const acknowledged = new Set<string>();
const requiredAudit: import('./types').RequiredAudit = async (draft) => {
  acknowledged.add(draft.key);
  return { key: draft.key };
};
const actuator = createActuator({
  secret,
  requiredAudit,
  durableAdmission: createAdmissionHttp(auditConfig),
  ...(env.GRAVESHIFT_MODE === undefined ? {} : { envMode: env.GRAVESHIFT_MODE }),
  // Boot config is the single source of truth (base convention); the durable audit
  // controls from our architecture remain wired alongside it.
  policy: (await loadGraveshiftConfig()).policy,
  namespace: env.TARGET_NAMESPACE ?? 'candy-shop',
  docker: env.DOCKER_PROXY_URL
    ? createDockerRestarter(env.DOCKER_PROXY_URL)
    : { restart: async () => unavailable('docker') },
  kube,
});

const server = Bun.serve({
  port: Number(env.PORT ?? 2603),
  maxRequestBodySize: MAX_ACTION_BODY_BYTES,
  fetch: createActionHandler(actuator),
});
log('info', 'actuator listening', { port: server.port });
