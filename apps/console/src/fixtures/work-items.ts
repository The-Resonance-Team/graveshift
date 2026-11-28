import type { PrRef, WorkItem } from '@graveshift/core';

import { projectScope, sampleFixture, SAMPLE_IDS, SAMPLE_TIMESTAMPS } from './sample';

export interface SampleWorkItemList {
  items: WorkItem[];
  total: number;
  offset: number;
  limit: number;
}

const donePr: PrRef = {
  repo: 'example/graveshift-sample',
  number: 101,
  url: 'https://github.com/example/graveshift-sample/pull/101',
  branch: 'sample/fix-checkout-memory',
  headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

const doneItem: WorkItem = {
  id: 'work-done',
  title: 'Sample completed checkout fix',
  description: 'Sample work item that shows a completed fix with a draft pull request.',
  successCriteria: ['A draft pull request is linked to the sample work item.'],
  subtasks: {
    items: [
      { id: 'subtask-done-1', title: 'Review the sample change', done: true },
      { id: 'subtask-done-2', title: 'Open the sample draft pull request', done: true },
    ],
    completed: 2,
  },
  status: 'done',
  priority: 'high',
  assignee: 'needs_agent_Exorcist',
  reporter: 'owner@example.com',
  startDate: '2026-11-20',
  dueDate: SAMPLE_TIMESTAMPS.date,
  sprint: 'Sample sprint 12',
  parent: null,
  labels: ['sample', 'memory'],
  team: 'Sample SRE',
  watchers: [SAMPLE_IDS.ownerAccount],
  severity: 'critical',
  service: 'checkout-api',
  diagnosisRef: 'diagnosis-sample-001',
  fixPriority: 0,
  draftPr: donePr,
};

const autoItem: WorkItem = {
  id: 'work-auto-agent',
  title: 'Sample automatic memory fix',
  description: 'Sample work item assigned to an Agent with an automatic fix trigger.',
  successCriteria: ['The sample Agent prepares a draft pull request.'],
  subtasks: {
    items: [
      { id: 'subtask-auto-1', title: 'Inspect the sample memory signal', done: false },
      { id: 'subtask-auto-2', title: 'Prepare the sample fix', done: false },
    ],
    completed: 0,
  },
  status: 'in_progress',
  priority: 'critical',
  assignee: 'needs_agent_Exorcist',
  reporter: 'owner@example.com',
  startDate: SAMPLE_TIMESTAMPS.date,
  dueDate: null,
  sprint: 'Sample sprint 12',
  parent: null,
  labels: ['sample', 'auto-fix'],
  team: 'Sample SRE',
  watchers: [SAMPLE_IDS.ownerAccount],
  severity: 'critical',
  service: 'checkout-api',
  diagnosisRef: 'diagnosis-sample-002',
  fixPriority: 1,
  draftPr: null,
};

const manualItem: WorkItem = {
  id: 'work-manual-agent',
  title: 'Sample manual timeout fix',
  description: 'Sample work item where a person starts the Agent fix with Fix now.',
  successCriteria: ['The sample Agent prepares a draft pull request after Fix now.'],
  subtasks: {
    items: [
      { id: 'subtask-manual-1', title: 'Confirm the sample timeout context', done: true },
      { id: 'subtask-manual-2', title: 'Prepare the sample fix', done: false },
      { id: 'subtask-manual-3', title: 'Review the sample draft pull request', done: false },
    ],
    completed: 1,
  },
  status: 'in_progress',
  priority: 'high',
  assignee: 'needs_agent_SRE Agent',
  reporter: 'owner@example.com',
  startDate: SAMPLE_TIMESTAMPS.date,
  dueDate: '2026-11-28',
  sprint: 'Sample sprint 12',
  parent: null,
  labels: ['sample', 'fix-now'],
  team: 'Sample SRE',
  watchers: [SAMPLE_IDS.ownerAccount],
  severity: 'warning',
  service: 'checkout-api',
  diagnosisRef: 'diagnosis-sample-003',
  fixPriority: 2,
  draftPr: null,
};

const questionItem: WorkItem = {
  id: 'work-saved-question',
  title: 'Sample saved Environment question',
  description: 'Sample work item with a saved Agent question that needs a human answer.',
  successCriteria: ['A person answers the saved sample question.'],
  subtasks: {
    items: [
      { id: 'subtask-question-1', title: 'Review the sample request', done: true },
      { id: 'subtask-question-2', title: 'Answer the saved sample question', done: false },
    ],
    completed: 1,
  },
  status: 'in_progress',
  priority: 'medium',
  assignee: 'needs_agent_SRE Agent',
  reporter: 'owner@example.com',
  startDate: SAMPLE_TIMESTAMPS.date,
  dueDate: null,
  sprint: null,
  parent: null,
  labels: ['sample', 'needs-input'],
  team: 'Sample SRE',
  watchers: [SAMPLE_IDS.ownerAccount],
  severity: 'warning',
  service: 'checkout-api',
  diagnosisRef: 'diagnosis-sample-004',
  fixPriority: 3,
  draftPr: null,
};

const failedItem: WorkItem = {
  id: 'work-failed',
  title: 'Sample failed patch generation',
  description: 'Sample work item whose fix attempt failed before a draft pull request.',
  successCriteria: ['A person reviews the sample failure and chooses the next step.'],
  subtasks: {
    items: [
      { id: 'subtask-failed-1', title: 'Review the sample request', done: true },
      { id: 'subtask-failed-2', title: 'Prepare a fix', done: false },
    ],
    completed: 1,
  },
  status: 'in_progress',
  priority: 'high',
  assignee: 'needs_agent_DevOps Agent',
  reporter: 'owner@example.com',
  startDate: SAMPLE_TIMESTAMPS.date,
  dueDate: null,
  sprint: null,
  parent: null,
  labels: ['sample', 'failed'],
  team: 'Sample SRE',
  watchers: [SAMPLE_IDS.ownerAccount],
  severity: 'critical',
  service: 'checkout-api',
  diagnosisRef: 'diagnosis-sample-005',
  fixPriority: 4,
  draftPr: null,
};

const retryItem: WorkItem = {
  id: 'work-no-draft-pr',
  title: 'Sample publication needs retry',
  description: 'Sample work item with an uncertain publication outcome and no draft pull request.',
  successCriteria: ['A person checks the sample publication state before any retry.'],
  subtasks: {
    items: [
      { id: 'subtask-retry-1', title: 'Prepare the sample fix', done: true },
      { id: 'subtask-retry-2', title: 'Confirm the sample publication state', done: false },
    ],
    completed: 1,
  },
  status: 'in_review',
  priority: 'medium',
  assignee: 'needs_agent_Exorcist',
  reporter: 'owner@example.com',
  startDate: SAMPLE_TIMESTAMPS.date,
  dueDate: null,
  sprint: null,
  parent: null,
  labels: ['sample', 'retry'],
  team: 'Sample SRE',
  watchers: [SAMPLE_IDS.ownerAccount],
  severity: 'warning',
  service: 'checkout-api',
  diagnosisRef: 'diagnosis-sample-006',
  fixPriority: 5,
  draftPr: null,
};

const humanItem: WorkItem = {
  id: 'work-human',
  title: 'Sample human investigation',
  description: 'Sample work item assigned to a person for manual investigation.',
  successCriteria: ['A person records the sample investigation outcome.'],
  subtasks: {
    items: [
      { id: 'subtask-human-1', title: 'Review the sample incident', done: false },
      { id: 'subtask-human-2', title: 'Choose the sample next step', done: false },
    ],
    completed: 0,
  },
  status: 'todo',
  priority: 'medium',
  assignee: 'needs_human',
  reporter: 'owner@example.com',
  startDate: null,
  dueDate: null,
  sprint: null,
  parent: null,
  labels: ['sample', 'human'],
  team: 'Sample SRE',
  watchers: [SAMPLE_IDS.ownerAccount],
  severity: 'info',
  service: 'checkout-api',
  diagnosisRef: 'diagnosis-sample-007',
  fixPriority: 6,
  draftPr: null,
};

const workItems = [doneItem, autoItem, manualItem, questionItem, failedItem, retryItem, humanItem];

export const sampleWorkItems = [
  sampleFixture('work-done', 'api_shaped', projectScope, doneItem),
  sampleFixture('work-auto-agent', 'api_shaped', projectScope, autoItem),
  sampleFixture('work-manual-agent', 'api_shaped', projectScope, manualItem),
  sampleFixture('work-saved-question', 'api_shaped', projectScope, questionItem),
  sampleFixture('work-failed', 'api_shaped', projectScope, failedItem),
  sampleFixture('work-no-draft-pr', 'api_shaped', projectScope, retryItem),
  sampleFixture('work-human', 'api_shaped', projectScope, humanItem),
] as const;

export const sampleWorkItemList = sampleFixture<SampleWorkItemList>(
  'work-item-list',
  'api_shaped',
  projectScope,
  { items: workItems, total: workItems.length, offset: 0, limit: 20 },
);

export const emptyWorkItemList = sampleFixture<SampleWorkItemList>(
  'work-item-list-empty',
  'api_shaped',
  projectScope,
  { items: [], total: 0, offset: 0, limit: 20 },
);
