import { AGENT_ASSIGNEE_PREFIX, NEEDS_HUMAN } from '@graveshift/core';

export function assignmentLabel(assignee: string): string {
  if (assignee === NEEDS_HUMAN) return 'Person';
  return `Agent, ${assignee.slice(AGENT_ASSIGNEE_PREFIX.length)}`;
}
