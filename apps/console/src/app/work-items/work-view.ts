import type { WorkItemPriority, WorkItemSeverity, WorkItemStatus } from '@graveshift/core';
import type {
  FixAttemptState,
  FixFailure,
  FixResult,
  FixTrigger,
  WorkRouting,
} from '@graveshift/work';

import type { SampleFixture } from '../../fixtures/sample';
import { sampleWorkRoutings } from '../../fixtures/work-routing';
import {
  sampleFixResults,
  sampleTriageResults,
  sampleWorkCommands,
} from '../../fixtures/work-results';

export const STATUS_LABELS: Readonly<Record<WorkItemStatus, string>> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
};

export const PRIORITY_LABELS: Readonly<Record<WorkItemPriority, string>> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const SEVERITY_LABELS: Readonly<Record<WorkItemSeverity, string>> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

export const FAILURE_LABELS: Readonly<Record<FixFailure, string>> = {
  none: 'No failure reported in this sample',
  auto_fix_disabled: 'Automatic fix is disabled',
  context_unavailable: 'Context unavailable',
  invalid_context: 'Invalid context',
  policy_denied: 'Policy denied the fix',
  patch_rejected: 'Patch rejected',
  pr_failed: 'Draft pull request failed',
  fix_error: 'Fix attempt failed',
  already_fixed: 'Already fixed',
  awaiting_answer: 'Waiting for an answer',
  needs_human: 'Needs a person',
  routing_failed: 'Routing failed',
  audit_failed: 'Audit failed',
  publication_uncertain: 'Publication outcome uncertain',
};

export const ROUTING_STATE_LABELS: Readonly<Record<FixAttemptState, string>> = {
  claimed: 'Claimed',
  awaiting_answer: 'Waiting for an answer',
  running: 'Running',
  publishing: 'Publishing',
  completed: 'Completed',
  failed: 'Failed',
  needs_human: 'Needs a person',
  uncertain: 'Uncertain',
};

export const TRIGGER_LABELS: Readonly<Record<FixTrigger, string>> = {
  auto_fix: 'Automatic trigger',
  fix_now: 'Fix now',
};

export const EFFECT_LABELS: Readonly<Record<FixResult['effect'], string>> = {
  allow: 'Allowed',
  deny: 'Denied',
  require_approval: 'Approval required',
  dry_run: 'Dry run',
};

export function statusLabel(status: WorkItemStatus): string {
  return STATUS_LABELS[status];
}

export function priorityLabel(priority: WorkItemPriority): string {
  return PRIORITY_LABELS[priority];
}

export function severityLabel(severity: WorkItemSeverity): string {
  return SEVERITY_LABELS[severity];
}

export function failureLabel(failure: FixFailure): string {
  return FAILURE_LABELS[failure];
}

export function routingStateLabel(state: FixAttemptState): string {
  return ROUTING_STATE_LABELS[state];
}

export function triggerLabel(trigger: FixTrigger): string {
  return TRIGGER_LABELS[trigger];
}

export function effectLabel(effect: FixResult['effect']): string {
  return EFFECT_LABELS[effect];
}

// Ids come from the work-item detail scenario fixtureIds in operations-scenarios.ts.
const ROUTING_FIXTURE_BY_ITEM: Readonly<Record<string, string>> = {
  'work-auto-agent': 'routing-auto-running',
  'work-manual-agent': 'routing-manual-running',
  'work-no-draft-pr': 'routing-publication-uncertain',
  'work-saved-question': 'routing-saved-question',
};

export function routingForItem(itemId: string): SampleFixture<WorkRouting> | undefined {
  const fixtureId = ROUTING_FIXTURE_BY_ITEM[itemId];
  if (fixtureId === undefined) return undefined;
  return sampleWorkRoutings.find((entry) => entry.id === fixtureId);
}

export function fixResultsForItem(itemId: string) {
  return sampleFixResults.filter((entry) => entry.payload.item.id === itemId);
}

export function triageResultsForItem(itemId: string) {
  return sampleTriageResults.filter((entry) => entry.payload.item.id === itemId);
}

export function commandsForItem(itemId: string) {
  return sampleWorkCommands.filter((entry) => entry.payload.id === itemId);
}
