import { projectScope, sampleFixture, SAMPLE_TIMESTAMPS } from './sample';

export interface PlannedWorkflowStep {
  id: string;
  kind: 'trigger' | 'inspect' | 'notify' | 'human_review';
  title: string;
  summary: string;
}

export interface PlannedWorkflow {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'published' | 'invalid';
  version: number;
  steps: PlannedWorkflowStep[];
  validation: string[];
  updatedAt: string;
}

export interface PlannedWorkflowDesigner {
  workflowId: string;
  selectedStepId: string;
  validation: string[];
}

const triggerStep: PlannedWorkflowStep = {
  id: 'step-trigger',
  kind: 'trigger',
  title: 'Start from a sample incident',
  summary: 'Illustrative trigger for a future incident workflow.',
};

const inspectStep: PlannedWorkflowStep = {
  id: 'step-inspect',
  kind: 'inspect',
  title: 'Inspect the sample work item',
  summary: 'Illustrative inspection step without diagnosis or evidence claims.',
};

const reviewStep: PlannedWorkflowStep = {
  id: 'step-review',
  kind: 'human_review',
  title: 'Request human review',
  summary: 'Illustrative review step. It does not grant permissions.',
};

const notifyStep: PlannedWorkflowStep = {
  id: 'step-notify',
  kind: 'notify',
  title: 'Send a sample notification',
  summary: 'Illustrative notification step with no live destination.',
};

const publishedWorkflow: PlannedWorkflow = {
  id: 'workflow-incident-published',
  name: 'Sample incident response',
  description: 'A planned example of a published Project workflow.',
  status: 'published',
  version: 3,
  steps: [triggerStep, inspectStep, reviewStep, notifyStep],
  validation: [],
  updatedAt: SAMPLE_TIMESTAMPS.anchor,
};

const draftWorkflow: PlannedWorkflow = {
  id: 'workflow-incident-draft',
  name: 'Sample incident response draft',
  description: 'A planned example of a workflow draft in the designer.',
  status: 'draft',
  version: 1,
  steps: [triggerStep, inspectStep, reviewStep],
  validation: [],
  updatedAt: SAMPLE_TIMESTAMPS.later,
};

const invalidWorkflow: PlannedWorkflow = {
  id: 'workflow-invalid',
  name: 'Sample incomplete workflow',
  description: 'A planned example of workflow validation before publish.',
  status: 'invalid',
  version: 2,
  steps: [triggerStep, inspectStep],
  validation: ['Add a notification step before publish.'],
  updatedAt: SAMPLE_TIMESTAMPS.later,
};

export const plannedWorkflows = [
  sampleFixture('workflow-incident-published', 'planned_demo', projectScope, publishedWorkflow),
  sampleFixture('workflow-incident-draft', 'planned_demo', projectScope, draftWorkflow),
  sampleFixture('workflow-invalid', 'planned_demo', projectScope, invalidWorkflow),
] as const;

export const plannedWorkflowDesigner = sampleFixture<PlannedWorkflowDesigner>(
  'workflow-designer',
  'planned_demo',
  projectScope,
  { workflowId: draftWorkflow.id, selectedStepId: reviewStep.id, validation: [] },
);
