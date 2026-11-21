import { AgentsFileSchema, type AgentsFile, mergeAgentTemplates } from '@graveshift/agents';
import { WorkItemClientConfigSchema, type WorkItemClientConfig } from '@graveshift/core';

export const WORK_ITEM_POLICY = Symbol('WORK_ITEM_POLICY');

export interface WorkItemPolicy {
  readonly agentNames: readonly string[];
  readonly clientConfig: WorkItemClientConfig;
}

export class WorkItemPolicyError extends Error {
  readonly code = 'WORK_ITEM_POLICY_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'WorkItemPolicyError';
  }
}

const EXAMPLE_AGENTS = new URL('../../../../agents.example.yaml', import.meta.url);

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The agent list comes from packages/agents config. A client file replaces a system template by name.
// GRAVESHIFT_AUTO_FIX is the client switch for auto-fix; default off until the client sets it.
export async function createWorkItemPolicy(): Promise<WorkItemPolicy> {
  const path = process.env.AGENTS_PATH ?? EXAMPLE_AGENTS;
  const label = typeof path === 'string' ? path : path.pathname;

  let raw: unknown;
  try {
    raw = Bun.YAML.parse(await Bun.file(path).text());
  } catch (error) {
    throw new WorkItemPolicyError(`Cannot read agent config at ${label}: ${detail(error)}`);
  }

  let file: AgentsFile;
  try {
    file = AgentsFileSchema.parse(raw);
  } catch (error) {
    throw new WorkItemPolicyError(`Invalid agent config at ${label}: ${detail(error)}`);
  }

  const agentNames = mergeAgentTemplates(file.system, file.client).map((agent) => agent.name);
  const clientConfig = WorkItemClientConfigSchema.parse({
    autoFixAllowed: process.env.GRAVESHIFT_AUTO_FIX === 'true',
  });
  return { agentNames, clientConfig };
}
