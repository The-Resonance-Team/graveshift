import { mergeAgentTemplates, type AgentConfig } from '@graveshift/agents';
import type { GraveshiftConfig } from '@graveshift/config';

export const WORK_ITEM_POLICY = Symbol('WORK_ITEM_POLICY');

export interface WorkItemPolicy {
  readonly agentNames: readonly string[];
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
    autoFixEnabled: config.fix.enabled,
  };
}

/** The durable routing seam: the Agent configurations used by Work commands. */
export const WORK_AGENTS = Symbol('WORK_AGENTS');
export type WorkAgents = readonly AgentConfig[];

/**
 * Apply the one global `fix.enabled` switch to the Agents that Work commands see.
 * An Agent with `autoFix: true` starts a fix on its own only while the switch is on.
 * With the switch off it behaves as `autoFix: false`, so "Fix now" stays the manual trigger.
 */
export function gateAutoFix(agents: WorkAgents, autoFixEnabled: boolean): WorkAgents {
  return agents.map((agent) => ({ ...agent, autoFix: agent.autoFix && autoFixEnabled }));
}
