import { createHash } from 'node:crypto';
import { selectAgentByKeywords, type AgentConfig } from '@graveshift/agents';
import {
  agentAssignee,
  createSubtasks,
  NEEDS_HUMAN,
  type Diagnosis,
  type WorkItem,
} from '@graveshift/core';
import type { RecordedHaunting } from '@graveshift/core/recorded';
import { WorkError } from '@graveshift/work';

export function hauntingWorkId(projectId: string, incidentId: string): string {
  return `work-${createHash('sha256')
    .update(JSON.stringify([projectId, incidentId]))
    .digest('hex')}`;
}

export interface HauntingWork {
  readonly item: WorkItem;
  readonly diagnosis: Diagnosis;
}

export function workFromHaunting(
  projectId: string,
  view: RecordedHaunting,
  agents: readonly AgentConfig[],
): HauntingWork {
  const { incident } = view;
  const diagnosis = incident.diagnosis;
  if (diagnosis === undefined)
    throw new WorkError('DIAGNOSIS_REQUIRED', 'The Haunting needs a verified Diagnosis');
  const selected = selectAgentByKeywords(
    agents,
    [diagnosis.rootCause, ...view.detections.map((entry) => entry.rule), view.category ?? ''].join(
      ' ',
    ),
  );
  const severity =
    view.severity ??
    (view.detections.some((entry) => entry.severity === 'critical')
      ? 'critical'
      : view.detections.some((entry) => entry.severity === 'warning')
        ? 'warning'
        : 'info');
  return {
    diagnosis,
    item: {
      id: hauntingWorkId(projectId, incident.id),
      title: `Fix the Haunting in ${incident.service}`,
      description: diagnosis.rootCause,
      successCriteria: [`The verified cause no longer affects ${incident.service}`],
      subtasks: createSubtasks([]),
      status: 'todo',
      priority: severity === 'critical' ? 'critical' : severity === 'warning' ? 'high' : 'low',
      assignee: selected === undefined ? NEEDS_HUMAN : agentAssignee(selected.name),
      reporter: 'wraith',
      startDate: null,
      dueDate: null,
      sprint: null,
      parent: null,
      labels: view.category === undefined ? [] : [view.category],
      team: 'sre',
      watchers: [],
      severity,
      service: incident.service,
      diagnosisRef: diagnosis.id,
      fixPriority: 100,
      draftPr: view.pr ?? null,
    },
  };
}
