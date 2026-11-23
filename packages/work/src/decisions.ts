import type { AgentConfig } from '@graveshift/agents';
import {
  AGENT_ASSIGNEE_PREFIX,
  NEEDS_HUMAN,
  TERMINAL_WORK_ITEM_STATUSES,
  agentAssignee,
  type WorkItem,
} from '@graveshift/core';

import { WorkError } from './errors';
import type { FixTrigger } from './results';

export type AgentTrigger = Pick<AgentConfig, 'name' | 'autoFix'>;

export interface TriageDecision {
  readonly item: WorkItem;
  readonly agent: string | null;
  readonly trigger: FixTrigger | null;
}

export function assertWorkOpen(item: WorkItem): void {
  if (TERMINAL_WORK_ITEM_STATUSES.some((status) => status === item.status)) {
    throw new WorkError('TERMINAL_STATUS', 'This Work item is complete');
  }
  if (item.draftPr !== null) {
    throw new WorkError('ALREADY_FIXED', 'This Work item already has an Exorcism');
  }
}

export function assignedAgent(
  assignee: string,
  agents: readonly AgentTrigger[],
): AgentTrigger | null {
  if (assignee === NEEDS_HUMAN) return null;
  if (!assignee.startsWith(AGENT_ASSIGNEE_PREFIX)) {
    throw new WorkError('INVALID_ASSIGNEE', 'Use needs_human or needs_agent_<name>');
  }
  const name = assignee.slice(AGENT_ASSIGNEE_PREFIX.length);
  const agent = agents.find((entry) => entry.name === name);
  if (agent === undefined) {
    throw new WorkError('UNKNOWN_AGENT', 'The assigned Agent is unavailable');
  }
  return agent;
}

export function decideTriage(
  item: WorkItem,
  assignee: string,
  agents: readonly AgentTrigger[],
): TriageDecision {
  assertWorkOpen(item);
  const agent = assignedAgent(assignee, agents);
  return {
    item: {
      ...item,
      assignee: agent === null ? NEEDS_HUMAN : agentAssignee(agent.name),
    },
    agent: agent?.name ?? null,
    trigger: agent?.autoFix ? 'auto_fix' : null,
  };
}

export function assertFixEligible(
  item: WorkItem,
  trigger: FixTrigger,
  agents: readonly AgentTrigger[],
): AgentTrigger {
  assertWorkOpen(item);
  const agent = assignedAgent(item.assignee, agents);
  if (agent === null) {
    throw new WorkError('MANUAL_ASSIGNMENT', 'A person must fix this Work item manually');
  }
  if (trigger === 'auto_fix' && !agent.autoFix) {
    throw new WorkError('AUTO_FIX_DISABLED', 'Auto-fix is disabled for this Agent');
  }
  if (trigger === 'fix_now' && agent.autoFix) {
    throw new WorkError('FIX_NOW_DISABLED', 'This Agent starts its fix from triage');
  }
  return agent;
}
