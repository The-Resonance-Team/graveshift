import { mergeAgentTemplates } from '@graveshift/agents';
import type { GraveshiftConfig } from '@graveshift/config';
import { WorkItemClientConfigSchema, type WorkItemClientConfig } from '@graveshift/core';

export const WORK_ITEM_POLICY = Symbol('WORK_ITEM_POLICY');

export interface WorkItemPolicy {
  readonly agentNames: readonly string[];
  readonly clientConfig: WorkItemClientConfig;
  readonly autoFixEnabled: boolean;
}

// Boot config validation owns bad-file errors. This helper only projects the
// validated config into the work-item seam; it reads no file and no env var.
export function createWorkItemPolicy(config: GraveshiftConfig): WorkItemPolicy {
  const agentNames = mergeAgentTemplates(config.agents.system, config.agents.client).map(
    (agent) => agent.name,
  );
  return {
    agentNames,
    clientConfig: WorkItemClientConfigSchema.parse({}),
    autoFixEnabled: config.fix.enabled,
  };
}
