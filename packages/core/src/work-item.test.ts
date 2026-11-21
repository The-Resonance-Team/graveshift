import { describe, expect, test } from 'bun:test';

import {
  agentAssignee,
  assertTriageAllowed,
  AssigneeSchema,
  createSubtasks,
  NEEDS_HUMAN,
  parseAssignee,
  triageToAgent,
  triageToHuman,
  WorkItemClientConfigSchema,
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
  autoFixAllowed: false,
};

const clientConfig = WorkItemClientConfigSchema.parse({ autoFixAllowed: true });

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

  test('assignee accepts needs_human and needs_agent_<name> only', () => {
    expect(AssigneeSchema.parse(NEEDS_HUMAN)).toBe(NEEDS_HUMAN);
    expect(AssigneeSchema.parse(agentAssignee('SRE Bot'))).toBe(agentAssignee('SRE Bot'));
    expect(AssigneeSchema.safeParse('unassigned').success).toBe(false);
  });
});

describe('triage helpers', () => {
  test('assigns to needs_human and marks autoFixAllowed from client config', () => {
    const next = triageToHuman(workItem, clientConfig);
    expect(next.assignee).toBe(NEEDS_HUMAN);
    expect(next.autoFixAllowed).toBe(true);
    expect(workItem.assignee).toBe(agentAssignee('SRE Bot'));
    expect(workItem.autoFixAllowed).toBe(false);
  });

  test('assigns to a known agent and rejects an unknown agent', () => {
    const names = ['SRE Bot'];
    const next = triageToAgent(workItem, 'SRE Bot', names, clientConfig);
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.value.assignee).toBe(agentAssignee('SRE Bot'));
    expect(triageToAgent(workItem, 'Missing Bot', names, clientConfig).ok).toBe(false);
  });

  test('parses assignees without a model call or a side effect', () => {
    const names = ['SRE Bot'];
    expect(parseAssignee(NEEDS_HUMAN, names).ok).toBe(true);
    expect(parseAssignee(agentAssignee('SRE Bot'), names).ok).toBe(true);
    expect(parseAssignee(agentAssignee('Missing Bot'), names).ok).toBe(false);
    expect(parseAssignee('human', names).ok).toBe(false);
  });

  test('blocks triage when the work item is done', () => {
    const done = { ...workItem, status: 'done' as const };
    expect(assertTriageAllowed(workItem).ok).toBe(true);
    const blocked = assertTriageAllowed(done);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe('TERMINAL_STATUS');
  });
});
