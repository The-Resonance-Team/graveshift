import { AgentConfigSchema } from '@graveshift/agents';
import { createAdapter, createGateway, GatewayConfigSchema } from '@graveshift/gateway';
import { ModeSchema, PolicySchema } from '@graveshift/policy';
import { z } from 'zod';

import type { PrivateApi } from './api-client';
import { gatewayAudit, type WriteAudit } from './audit';

export const BootConfigSchema = z
  .object({
    projectIds: z.array(z.string().regex(/^\d{1,20}$/)),
    agents: z.array(AgentConfigSchema),
    policy: PolicySchema,
    gateway: GatewayConfigSchema,
    natsStream: z.string().regex(/^[A-Za-z0-9_-]+$/),
    mode: ModeSchema.optional(),
  })
  .strict();
export type BootConfig = z.infer<typeof BootConfigSchema>;

export async function loadBootConfig(api: PrivateApi): Promise<BootConfig> {
  return api.get('/internal/config', BootConfigSchema);
}

export function configuredGateway(
  config: BootConfig,
  audit: WriteAudit,
  env: Record<string, string | undefined> = process.env,
) {
  const bindings = config.agents.map((agent) => {
    const adapter = createAdapter(agent, { env });
    if (adapter.capability !== 'structured_language') {
      throw new Error('Configured Agent does not support structured language tasks');
    }
    return { agent, adapter };
  });
  return createGateway({ agents: bindings, config: config.gateway, onAudit: gatewayAudit(audit) });
}
