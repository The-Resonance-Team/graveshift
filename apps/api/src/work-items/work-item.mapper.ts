import { createHash } from 'node:crypto';
import { WorkItemSchema, type AuditDraft, type WorkItem } from '@graveshift/core';
import { redact } from '@graveshift/redactor';
import {
  FixAttemptSchema,
  WorkSnapshotSchema,
  type FixAttempt,
  type WorkCaller,
  type WorkRequest,
  type WorkSnapshot,
} from '@graveshift/work';
import type { RoutingProgress } from '@graveshift/agents/routing';

import type { AttemptRow, WorkRow } from './work-item.select';

export function toWorkItem(row: WorkRow): WorkItem {
  return WorkItemSchema.parse({
    ...row,
    startDate: row.startDate?.toISOString().split('T')[0] ?? null,
    dueDate: row.dueDate?.toISOString().split('T')[0] ?? null,
  });
}

export function toAttempt(row: AttemptRow): FixAttempt {
  return FixAttemptSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    leaseUntil: row.leaseUntil?.toISOString() ?? null,
  });
}

export function toSnapshot(row: WorkRow, attempt?: AttemptRow): WorkSnapshot {
  return WorkSnapshotSchema.parse({
    item: toWorkItem(row),
    version: row.version,
    ...(attempt === undefined ? {} : { activeAttempt: toAttempt(attempt) }),
    ...(row.diagnosis === null ? {} : { diagnosis: row.diagnosis }),
  });
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
    .join(',')}}`;
}

export function requestHash(caller: WorkCaller, id: string, request: WorkRequest): string {
  return createHash('sha256')
    .update(
      canonical([caller.projectId, caller.actor, caller.expectedVersion ?? null, id, request]),
    )
    .digest('hex');
}

export function workAudit(
  caller: WorkCaller,
  id: string,
  event: string,
  facts: { version: number; attemptId?: string; state?: string },
): AuditDraft {
  const key = createHash('sha256')
    .update(canonical([caller, id, event, facts]))
    .digest('hex');
  return {
    key: `work:${key}`,
    actor: caller.actor,
    type: `work.${event}`,
    payload: { workItemId: id, commandId: caller.commandId, ...facts },
  };
}

export function safeParams(params: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, redact(value)]));
}

export function safeProgress(progress: RoutingProgress): RoutingProgress {
  return {
    ...progress,
    text: redact(progress.text),
    question: redact(progress.question),
    params: safeParams(progress.params),
  };
}
