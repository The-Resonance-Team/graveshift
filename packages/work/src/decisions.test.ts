import { createSubtasks, type WorkItem } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import { assertFixEligible, decideTriage } from './decisions';
import { WorkError } from './errors';

const agents = [
  { name: 'Automatic Agent', autoFix: true },
  { name: 'Manual trigger Agent', autoFix: false },
];

function item(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'work-1',
    title: 'A verified incident',
    description: '',
    successCriteria: [],
    subtasks: createSubtasks([]),
    status: 'todo',
    priority: 'high',
    assignee: 'needs_human',
    reporter: 'wraith',
    startDate: null,
    dueDate: null,
    sprint: null,
    parent: null,
    labels: [],
    team: 'sre',
    watchers: [],
    severity: 'critical',
    service: 'api',
    diagnosisRef: 'diagnosis-1',
    fixPriority: 100,
    draftPr: null,
    ...overrides,
  };
}

describe('Work item assignment and trigger decisions', () => {
  test('Human assignment never selects an Agent or a trigger', () => {
    expect(decideTriage(item(), 'needs_human', agents)).toMatchObject({
      item: { assignee: 'needs_human' },
      agent: null,
      trigger: null,
    });
    expect(() => assertFixEligible(item(), 'fix_now', agents)).toThrow(
      new WorkError('MANUAL_ASSIGNMENT', 'A person must fix this Work item manually'),
    );
    expect(() => assertFixEligible(item(), 'auto_fix', agents)).toThrow(WorkError);
  });

  test('Agent config alone selects the automatic or explicit trigger', () => {
    const automatic = decideTriage(item(), 'needs_agent_Automatic Agent', agents);
    expect(automatic.agent).toBe('Automatic Agent');
    expect(automatic.trigger).toBe('auto_fix');
    expect(assertFixEligible(automatic.item, 'auto_fix', agents).name).toBe('Automatic Agent');
    expect(() => assertFixEligible(automatic.item, 'fix_now', agents)).toThrow(WorkError);

    const explicit = decideTriage(item(), 'needs_agent_Manual trigger Agent', agents);
    expect(explicit.agent).toBe('Manual trigger Agent');
    expect(explicit.trigger).toBeNull();
    expect(assertFixEligible(explicit.item, 'fix_now', agents).name).toBe('Manual trigger Agent');
    expect(() => assertFixEligible(explicit.item, 'auto_fix', agents)).toThrow(WorkError);
  });

  test('an assignment selects the named Agent even when another Agent matches the description', () => {
    const next = decideTriage(
      item({ description: 'Automatic Agent Automatic Agent' }),
      'needs_agent_Manual trigger Agent',
      agents,
    );
    expect(next.agent).toBe('Manual trigger Agent');
    expect(next.trigger).toBeNull();
  });

  test('the current Agent config decides eligibility for an assigned item', () => {
    const assigned = item({ assignee: 'needs_agent_Manual trigger Agent' });
    expect(assertFixEligible(assigned, 'fix_now', agents).name).toBe('Manual trigger Agent');
    expect(() => assertFixEligible(assigned, 'auto_fix', agents)).toThrow(WorkError);
  });

  test('unknown Agent names, terminal items, and malformed assignments fail before a fix', () => {
    expect(() => decideTriage(item(), 'needs_agent_Missing', agents)).toThrow(WorkError);
    expect(() => decideTriage(item(), 'needs_human-extra', agents)).toThrow(WorkError);
    expect(() => decideTriage(item({ status: 'done' }), 'needs_human', agents)).toThrow(WorkError);
  });
});
