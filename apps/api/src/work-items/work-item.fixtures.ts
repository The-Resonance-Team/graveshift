import { createSubtasks, NEEDS_HUMAN, type WorkItem } from '@graveshift/core';

function workItem(id: string, title: string, overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id,
    title,
    description: '',
    successCriteria: [],
    subtasks: createSubtasks([]),
    status: 'todo',
    priority: 'medium',
    assignee: NEEDS_HUMAN,
    reporter: 'wraith',
    startDate: null,
    dueDate: null,
    sprint: null,
    parent: null,
    labels: [],
    team: 'sre',
    watchers: [],
    severity: 'warning',
    service: 'api',
    diagnosisRef: 'diag-1',
    fixPriority: 100,
    draftPr: null,
    ...overrides,
  };
}

// ponytail: demo data only, enabled by GRAVESHIFT_WORK_ITEM_DEMO; remove when persistence lands
export const DEMO_WORK_ITEMS: WorkItem[] = [
  workItem('wi-1', 'Fix OOM on api', {
    description: 'The api grave was drained by a leech.',
    successCriteria: ['Memory stays below the limit for one hour.'],
    subtasks: createSubtasks([
      { id: 'st-1', title: 'Read the diagnosis', done: true },
      { id: 'st-2', title: 'Propose a fix', done: false },
    ]),
    priority: 'high',
    severity: 'critical',
    startDate: '2026-11-20',
    dueDate: '2026-11-27',
    sprint: '2026-W48',
    labels: ['oom'],
    watchers: ['exorcist'],
    diagnosisRef: 'diag-1',
  }),
  workItem('wi-2', 'Reduce restarts on worker', {
    status: 'in_progress',
    subtasks: createSubtasks([
      { id: 'st-3', title: 'Collect logs', done: false },
      { id: 'st-4', title: 'Check the rule set', done: false },
    ]),
    service: 'worker',
    diagnosisRef: 'diag-2',
  }),
  workItem('wi-3', 'Update image pull policy on proxy', {
    status: 'done',
    priority: 'low',
    severity: 'info',
    subtasks: createSubtasks([{ id: 'st-5', title: 'Merge the draft PR', done: true }]),
    service: 'proxy',
    diagnosisRef: 'diag-3',
  }),
];
