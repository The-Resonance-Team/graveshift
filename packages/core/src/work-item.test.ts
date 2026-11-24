import { describe, expect, test } from 'bun:test';

import {
  agentAssignee,
  AssigneeSchema,
  createSubtasks,
  NEEDS_HUMAN,
  parseAssignee,
  promoteToFront,
  WorkItemSchema,
  type WorkItem,
} from './index';

const workItem: WorkItem = {
  id: 'wi-1',
  title: 'Fix OOM on api',
  description: 'The api grave was drained by a leech.',
  successCriteria: ['Memory stays below the limit for one hour.'],
  subtasks: createSubtasks([
    { id: 'st-1', title: 'Read the diagnosis', done: true },
    { id: 'st-2', title: 'Propose a fix', done: false },
  ]),
  status: 'todo',
  priority: 'high',
  assignee: agentAssignee('SRE Bot'),
  reporter: 'wraith',
  startDate: '2026-11-20',
  dueDate: '2026-11-27',
  sprint: '2026-W48',
  parent: null,
  labels: ['oom'],
  team: 'sre',
  watchers: ['exorcist'],
  severity: 'critical',
  service: 'api',
  diagnosisRef: 'diag-1',
  fixPriority: 100,
  draftPr: null,
};

describe('work item schema', () => {
  test('accepts a complete work item and rejects a wrong subtask count', () => {
    expect(WorkItemSchema.parse(workItem)).toEqual(workItem);
    expect(
      WorkItemSchema.safeParse({
        ...workItem,
        subtasks: { ...workItem.subtasks, completed: 9 },
      }).success,
    ).toBe(false);
  });

  test('promoteToFront moves a work item to the front of the fix queue', () => {
    const next = promoteToFront(workItem);
    expect(next.fixPriority).toBe(0);
    expect(workItem.fixPriority).toBe(100);
    expect(next.id).toBe(workItem.id);
    expect(WorkItemSchema.parse(next)).toEqual(next);
  });

  test('assignee accepts needs_human and needs_agent_<name> only', () => {
    expect(AssigneeSchema.parse(NEEDS_HUMAN)).toBe(NEEDS_HUMAN);
    expect(AssigneeSchema.parse(agentAssignee('SRE Bot'))).toBe(agentAssignee('SRE Bot'));
    expect(AssigneeSchema.safeParse('unassigned').success).toBe(false);
  });
});

describe('the one assignee seam', () => {
  test('agentAssignee formats what parseAssignee accepts', () => {
    const names = ['SRE Bot'];
    for (const name of names) {
      const formatted = agentAssignee(name);
      expect(AssigneeSchema.parse(formatted)).toBe(formatted);
      const parsed = parseAssignee(formatted, names);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.value).toBe(formatted);
    }
    const human = parseAssignee(NEEDS_HUMAN, names);
    expect(human.ok).toBe(true);
    if (human.ok) expect(human.value).toBe(NEEDS_HUMAN);
  });

  test('rejects an unknown agent, a bare prefix and a foreign format', () => {
    const names = ['SRE Bot'];
    expect(parseAssignee(agentAssignee('Missing Bot'), names).ok).toBe(false);
    expect(() => agentAssignee('')).toThrow();
    expect(parseAssignee('needs_agent_', names).ok).toBe(false);
    expect(parseAssignee('human', names).ok).toBe(false);
    expect(AssigneeSchema.safeParse('needs_agent_').success).toBe(false);
  });
});
