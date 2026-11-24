import { loadGraveshiftConfig } from '@graveshift/config';

import { createDurableAdmission } from './admission-durable';
import type { RequiredAdmission } from './claims';
import { createDockerRestarter, createKubeWriter } from './backends';
import { createActuator } from './execute';
import { createActionHandler, MAX_ACTION_BODY_BYTES } from './handler';
import { admissionErrorCode } from './startup-error';
import { createBreaker } from './guards';
import { MIN_SECRET_LENGTH } from './sign';
import { ActuatorError, type KubeWriter, type RequiredAudit } from './types';

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

// ponytail: the signed action claim has no projectId, so the actuator must not
// append audit to an arbitrary Project chain. Acknowledge locally and report
// 'pending' until the actuator receives a signed projectId in the claim.
const requiredAudit: RequiredAudit = async (draft) => ({ key: draft.key });
const policy = (await loadGraveshiftConfig()).policy;

const breaker = createBreaker({
  page: (service, reason) => log('warn', 'runtime action circuit opened', { service, reason }),
});
const envMode = env.GRAVESHIFT_MODE;

// Durable admission is mandatory. If the store cannot be opened, do not start.
const stateDir = env.ACTUATOR_STATE_DIR ?? '/data/graveshift-actuator';
let durableAdmission: RequiredAdmission;
try {
  durableAdmission = createDurableAdmission(`${stateDir}/admission.db`, {
    policy,
    now: Date.now,
    audit: requiredAudit,
    ...(envMode === undefined ? {} : { envMode }),
    blocked: (service) => (breaker.isOpen(service) ? 'circuit_open' : undefined),
  });
} catch (error) {
  // Log only the error code. The store path is deployment-local, not log data.
  log('fatal', 'Durable admission store is unavailable; refusing to start', {
    code: admissionErrorCode(error),
  });
  process.exit(1);
}
const actuator = createActuator({
  secret,
  requiredAudit,
  durableAdmission,
  durableAudit: false,
  breaker,
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
