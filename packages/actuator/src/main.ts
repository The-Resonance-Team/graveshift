import { loadGraveshiftConfig } from '@graveshift/config';

import { createAdmissionFixture } from './admission-fixture';
import { createDockerRestarter, createKubeWriter } from './backends';
import { createActuator } from './execute';
import { createActionHandler, MAX_ACTION_BODY_BYTES } from './handler';
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
// bind audit or admission to an arbitrary grant entry. Both stay local.
// Upgrade both when the actuator receives a signed projectId in the claim.
const requiredAudit: RequiredAudit = async (draft) => ({ key: draft.key });
const policy = (await loadGraveshiftConfig()).policy;
const durableAdmission = createAdmissionFixture(policy, () => Date.now(), requiredAudit).admission;
const actuator = createActuator({
  secret,
  requiredAudit,
  durableAdmission,
  ...(env.GRAVESHIFT_MODE === undefined ? {} : { envMode: env.GRAVESHIFT_MODE }),
  // Boot config is the single source of truth (base convention); the durable audit
  // controls from our architecture remain wired alongside it.
  policy,
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
