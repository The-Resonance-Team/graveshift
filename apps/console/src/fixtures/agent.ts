import { projectScope, sampleFixture, SAMPLE_TIMESTAMPS } from './sample';

export interface PlannedMessage {
  id: string;
  role: 'user' | 'agent';
  body: string;
  createdAt: string;
}

export interface PlannedActivity {
  id: string;
  kind: 'progress' | 'question' | 'human_review' | 'result';
  label: string;
  detail: string;
  state: 'pending' | 'complete' | 'failed';
  createdAt: string;
}

export interface PlannedArtifact {
  id: string;
  kind: 'document';
  title: string;
  filename: string;
  summary: string;
  content: string;
  sourceMessageId: string;
  status: 'ready' | 'unavailable';
  createdAt: string;
}

export interface PlannedArtifactPanel {
  artifacts: PlannedArtifact[];
  selectedArtifactId: string | null;
}

export interface PlannedAgentSheet {
  mode: 'sheet';
  showContextPanel: false;
  conversation: PlannedMessage[];
  activities: PlannedActivity[];
}

export interface PlannedAgentPage {
  mode: 'full_screen';
  showContextPanel: true;
  conversation: PlannedMessage[];
  activities: PlannedActivity[];
  contextPanel: 'artifacts';
  artifactPanelId: string;
}

const conversation: PlannedMessage[] = [
  {
    id: 'message-1',
    role: 'user',
    body: 'Review the sample work item and tell me what input is needed.',
    createdAt: SAMPLE_TIMESTAMPS.earlier,
  },
  {
    id: 'message-2',
    role: 'agent',
    body: 'This is a planned Workspace sample. It does not claim that a live Agent ran.',
    createdAt: SAMPLE_TIMESTAMPS.anchor,
  },
  {
    id: 'message-3',
    role: 'agent',
    body: 'Sample saved question: Which Environment should the change target?',
    createdAt: SAMPLE_TIMESTAMPS.later,
  },
  {
    id: 'message-4',
    role: 'user',
    body: 'Production.',
    createdAt: SAMPLE_TIMESTAMPS.later,
  },
];

const activities: PlannedActivity[] = [
  {
    id: 'activity-progress',
    kind: 'progress',
    label: 'Sample request reviewed',
    detail: 'Static progress sample for the design review.',
    state: 'complete',
    createdAt: SAMPLE_TIMESTAMPS.anchor,
  },
  {
    id: 'activity-question',
    kind: 'question',
    label: 'Environment needed',
    detail: 'Which Environment should the change target?',
    state: 'pending',
    createdAt: SAMPLE_TIMESTAMPS.later,
  },
  {
    id: 'activity-human-review',
    kind: 'human_review',
    label: 'Human review requested',
    detail: 'Sample only. No mutation or approval action is available.',
    state: 'pending',
    createdAt: SAMPLE_TIMESTAMPS.later,
  },
];

const readyArtifact: PlannedArtifact = {
  id: 'artifact-checklist',
  kind: 'document',
  title: 'Sample change checklist',
  filename: 'sample-change-checklist.md',
  summary: 'An illustrative checklist linked to the sample conversation.',
  content: 'Confirm the target Environment.\nReview the sample change.\nInspect the sample output.',
  sourceMessageId: 'message-2',
  status: 'ready',
  createdAt: SAMPLE_TIMESTAMPS.later,
};

const unavailableArtifact: PlannedArtifact = {
  id: 'artifact-unavailable',
  kind: 'document',
  title: 'Sample unavailable output',
  filename: 'sample-unavailable-output.md',
  summary: 'An illustrative unavailable artifact state.',
  content: 'The sample output is not available.',
  sourceMessageId: 'message-2',
  status: 'unavailable',
  createdAt: SAMPLE_TIMESTAMPS.later,
};

export const plannedAgentSheet = sampleFixture<PlannedAgentSheet>(
  'agent-sheet-conversation',
  'planned_demo',
  projectScope,
  { mode: 'sheet', showContextPanel: false, conversation, activities },
);

export const plannedAgentPage = sampleFixture<PlannedAgentPage>(
  'agent-page-conversation',
  'planned_demo',
  projectScope,
  {
    mode: 'full_screen',
    showContextPanel: true,
    conversation,
    activities,
    contextPanel: 'artifacts',
    artifactPanelId: 'artifact-panel',
  },
);

export const plannedArtifactPanel = sampleFixture<PlannedArtifactPanel>(
  'artifact-panel',
  'planned_demo',
  projectScope,
  { artifacts: [readyArtifact], selectedArtifactId: readyArtifact.id },
);

export const emptyArtifactPanel = sampleFixture<PlannedArtifactPanel>(
  'artifact-panel-empty',
  'planned_demo',
  projectScope,
  { artifacts: [], selectedArtifactId: null },
);

export const unavailableArtifactPanel = sampleFixture<PlannedArtifactPanel>(
  'artifact-panel-unavailable',
  'planned_demo',
  projectScope,
  { artifacts: [unavailableArtifact], selectedArtifactId: unavailableArtifact.id },
);
