import { AgentsFileSchema, mergeAgentTemplates } from '@graveshift/agents';
import { WorkItemClientConfigSchema, type WorkItemClientConfig } from '@graveshift/core';

export const WORK_ITEM_POLICY = Symbol('WORK_ITEM_POLICY');

export interface WorkItemPolicy {
  readonly agentNames: readonly string[];
  readonly clientConfig: WorkItemClientConfig;
}

const EXAMPLE_AGENTS = new URL('../../../../agents.example.yaml', import.meta.url);

// The agent list comes from packages/agents config. A client file replaces a system template by name.
// GRAVESHIFT_AUTO_FIX is the client switch for auto-fix; default off until the client sets it.
export async function createWorkItemPolicy(): Promise<WorkItemPolicy> {
  const path = process.env.AGENTS_PATH ?? EXAMPLE_AGENTS;
  const file = AgentsFileSchema.parse(Bun.YAML.parse(await Bun.file(path).text()));
  const agentNames = mergeAgentTemplates(file.system, file.client).map((agent) => agent.name);
  const clientConfig = WorkItemClientConfigSchema.parse({
    autoFixAllowed: process.env.GRAVESHIFT_AUTO_FIX === 'true',
  });
  return { agentNames, clientConfig };
}
