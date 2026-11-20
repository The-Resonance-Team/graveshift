import { z } from 'zod';

import { err, ok, type Result, TriageError } from './errors';

const id = z.string().min(1);

export const WORK_ITEM_STATUSES = ['todo', 'in_progress', 'in_review', 'done'] as const;
export const WorkItemStatusSchema = z.enum(WORK_ITEM_STATUSES);
export type WorkItemStatus = z.infer<typeof WorkItemStatusSchema>;

export const WORK_ITEM_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export const WorkItemPrioritySchema = z.enum(WORK_ITEM_PRIORITIES);
export type WorkItemPriority = z.infer<typeof WorkItemPrioritySchema>;

export const WORK_ITEM_SEVERITIES = ['info', 'warning', 'critical'] as const;
export const WorkItemSeveritySchema = z.enum(WORK_ITEM_SEVERITIES);
export type WorkItemSeverity = z.infer<typeof WorkItemSeveritySchema>;

export const SubtaskSchema = z.object({
  id,
  title: z.string().min(1),
  done: z.boolean(),
});
export type Subtask = z.infer<typeof SubtaskSchema>;

export function countCompletedSubtasks(items: readonly Subtask[]): number {
  return items.filter((item) => item.done).length;
}

export function createSubtasks(items: readonly Subtask[]): Subtasks {
  return { items: [...items], completed: countCompletedSubtasks(items) };
}

// The completed count rides with the items so a table row needs no extra query.
export const SubtasksSchema = z
  .object({
    items: z.array(SubtaskSchema),
    completed: z.number().int().min(0),
  })
  .refine((subtasks) => subtasks.completed === countCompletedSubtasks(subtasks.items), {
    message: 'completed must equal the number of done subtasks',
  });
export type Subtasks = z.infer<typeof SubtasksSchema>;

export const WorkItemSchema = z.object({
  id,
  title: z.string().min(1),
  description: z.string(),
  successCriteria: z.array(z.string().min(1)),
  subtasks: SubtasksSchema,
  status: WorkItemStatusSchema,
  priority: WorkItemPrioritySchema,
  assignee: z.string().min(1),
  reporter: z.string().min(1),
  startDate: z.iso.date().nullable(),
  dueDate: z.iso.date().nullable(),
  sprint: z.string().min(1).nullable(),
  parent: id.nullable(),
  labels: z.array(z.string().min(1)),
  team: z.string().min(1),
  watchers: z.array(z.string().min(1)),
  severity: WorkItemSeveritySchema,
  service: id,
  diagnosisRef: id,
  autoFixAllowed: z.boolean(),
});
export type WorkItem = z.infer<typeof WorkItemSchema>;

// Client config decides whether a work item may be fixed without a Fix now action.
export const WorkItemClientConfigSchema = z
  .object({ autoFixAllowed: z.boolean().default(false) })
  .strict();
export type WorkItemClientConfig = z.infer<typeof WorkItemClientConfigSchema>;

export const NEEDS_HUMAN = 'needs_human' as const;
export const AGENT_ASSIGNEE_PREFIX = 'needs_agent_' as const;

export function agentAssignee(agentName: string): string {
  return `${AGENT_ASSIGNEE_PREFIX}${agentName}`;
}

export function applyClientConfig(item: WorkItem, clientConfig: WorkItemClientConfig): WorkItem {
  return { ...item, autoFixAllowed: clientConfig.autoFixAllowed };
}

// Assignees stay strings on the wire. Neither helper calls a model or changes shared state.
export function triageToHuman(item: WorkItem, clientConfig: WorkItemClientConfig): WorkItem {
  return applyClientConfig({ ...item, assignee: NEEDS_HUMAN }, clientConfig);
}

export function triageToAgent(
  item: WorkItem,
  agentName: string,
  agentNames: readonly string[],
  clientConfig: WorkItemClientConfig,
): Result<WorkItem, TriageError> {
  if (!agentNames.includes(agentName)) {
    return err(new TriageError('UNKNOWN_AGENT', `Unknown agent: ${agentName}`));
  }
  return ok(applyClientConfig({ ...item, assignee: agentAssignee(agentName) }, clientConfig));
}

// A triage request carries the full assignee, not a bare agent name.
export function parseAssignee(
  assignee: string,
  agentNames: readonly string[],
): Result<string, TriageError> {
  if (assignee === NEEDS_HUMAN) return ok(assignee);
  if (!assignee.startsWith(AGENT_ASSIGNEE_PREFIX)) {
    return err(new TriageError('INVALID_ASSIGNEE', `Invalid assignee: ${assignee}`));
  }
  const agentName = assignee.slice(AGENT_ASSIGNEE_PREFIX.length);
  if (agentName.length === 0 || !agentNames.includes(agentName)) {
    return err(new TriageError('UNKNOWN_AGENT', `Unknown agent assignee: ${assignee}`));
  }
  return ok(assignee);
}
