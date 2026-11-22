import { resolveAgents, type AgentConfig } from '@graveshift/agents';
import type { GraveshiftConfig } from '@graveshift/config';
import type { GatewayConfig } from '@graveshift/gateway/config';
import type { Policy } from '@graveshift/policy';
import type { ConfigService } from '@nestjs/config';

import { createAuthConfig } from '../auth/auth.config';
import type { AuthConfig } from '../auth/auth.types';
import type { RootEnv } from './env.schema';

export const BOOT_CONFIG = Symbol('BOOT_CONFIG');

export interface RootBootConfig {
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly natsUrl?: string;
  readonly natsStream: string;
  readonly projectId: string;
  readonly apiInternalToken: string;
  readonly daemonInternalToken: string;
  readonly apiUrl: string;
  readonly daemonUrl: string;
  readonly agents: readonly AgentConfig[];
  readonly agentsFile: GraveshiftConfig['agents'];
  readonly policy: Policy;
  readonly gateway: GatewayConfig;
  readonly mode?: string;
  readonly auth: AuthConfig;
}

function freezeConfig<Value>(value: Value): Value {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeConfig(child);
    Object.freeze(value);
  }
  return value;
}

// One committed config file at boot is the source of truth for agents and policy.
// Deployment-local secrets and URLs come from the validated environment.
export async function loadBootConfig(
  config: ConfigService<RootEnv, true>,
  graveshift: GraveshiftConfig,
): Promise<RootBootConfig> {
  const natsUrl = config.get('GRAVESHIFT_NATS_URL', { infer: true });
  const mode = config.get('GRAVESHIFT_MODE', { infer: true });
  return freezeConfig({
    host: config.getOrThrow('HOST', { infer: true }),
    port: config.getOrThrow('PORT', { infer: true }),
    databaseUrl: config.getOrThrow('DATABASE_URL'),
    ...(natsUrl === undefined ? {} : { natsUrl }),
    natsStream: config.getOrThrow('GRAVESHIFT_NATS_STREAM'),
    projectId: config.getOrThrow('GRAVESHIFT_PROJECT_ID'),
    apiInternalToken: config.getOrThrow('GRAVESHIFT_API_INTERNAL_TOKEN'),
    daemonInternalToken: config.getOrThrow('GRAVESHIFT_DAEMON_INTERNAL_TOKEN'),
    apiUrl: config.getOrThrow('GRAVESHIFT_API_URL'),
    daemonUrl: config.getOrThrow('GRAVESHIFT_DAEMON_URL'),
    agents: resolveAgents(graveshift.agents),
    agentsFile: graveshift.agents,
    policy: graveshift.policy,
    gateway: config.getOrThrow('GRAVESHIFT_GATEWAY_CONFIG', { infer: true }),
    ...(mode === undefined ? {} : { mode }),
    auth: createAuthConfig(config),
  });
}
