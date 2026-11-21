import { z } from 'zod';

import { err, ok, type Result, TriageError } from './errors';

const id = z.string().min(1);

export const NEEDS_HUMAN = 'needs_human' as const;
export const AGENT_ASSIGNEE_PREFIX = 'needs_agent_' as const;

export const WORK_ITEM_STATUSES = ['todo', 'in_progress', 'in_review', 'done'] as const;
export const WorkItemStatusSchema = z.enum(WORK_ITEM_STATUSES);
export type WorkItemStatus = z.infer<typeof WorkItemStatusSchema>;

// A terminal work item cannot be reassigned or have autoFixAllowed rewritten.
export const TERMINAL_WORK_ITEM_STATUSES = ['done'] as const;

export const WORK_ITEM_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export const WorkItemPrioritySchema = z.enum(WORK_ITEM_PRIORITIES);
export type WorkItemPriority = z.infer<typeof WorkItemPrioritySchema>;

export const WORK_ITEM_SEVERITIES = ['info', 'warning', 'critical'] as const;
export const WorkItemSeveritySchema = z.enum(WORK_ITEM_SEVERITIES);
export type WorkItemSeverity = z.infer<typeof WorkItemSeveritySchema>;

// A draft pull request is the terminal state of a fix. No merge ref exists here.
export const PrRefSchema = z
  .object({
    repo: id,
    number: z.number().int().min(1),
    url: z.string().min(1),
    branch: z.string().min(1),
    headSha: z.string().min(1),
  })
  .strict();
export type PrRef = z.infer<typeof PrRefSchema>;

export const SubtaskSchema = z.object({
  id,
  title: z.string().min(1),
  done: z.boolean(),
});
export type Subtask = z.infer<typeof SubtaskSchema>;

export function countCompletedSubtasks(items: readonly Subtask[]): number {
  return items.filter((item) => item.done).length;
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

export function createSubtasks(items: readonly Subtask[]): Subtasks {
  return { items: [...items], completed: countCompletedSubtasks(items) };
}

// The template literal keeps the generated contract distinct from a generic string.
export const AgentAssigneeSchema = z.templateLiteral([
  z.literal(AGENT_ASSIGNEE_PREFIX),
  z.string(),
]);
export type AgentAssignee = z.infer<typeof AgentAssigneeSchema>;

export const AssigneeSchema = z.union([z.literal(NEEDS_HUMAN), AgentAssigneeSchema]);
export type Assignee = z.infer<typeof AssigneeSchema>;

export function agentAssignee(agentName: string): AgentAssignee {
  // The prefix is fixed above; TypeScript does not infer template literal types from interpolation.
  return `${AGENT_ASSIGNEE_PREFIX}${agentName}` as AgentAssignee;
}

export const WorkItemSchema = z.object({
  id,
  title: z.string().min(1),
  description: z.string(),
  successCriteria: z.array(z.string().min(1)),
  subtasks: SubtasksSchema,
  status: WorkItemStatusSchema,
  priority: WorkItemPrioritySchema,
  assignee: AssigneeSchema,
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
  // Lower values sit nearer the front of the fix queue. Zero is the front.
  fixPriority: z.number().int().min(0),
  // Set when a fix opened a draft pull request. Null means no PR was opened yet.
  draftPr: PrRefSchema.nullable(),
});
export type WorkItem = z.infer<typeof WorkItemSchema>;

export const FIX_QUEUE_FRONT = 0;

// Fix now moves a work item to the front of the fix queue. It changes no other field.
export function promoteToFront(item: WorkItem): WorkItem {
  return { ...item, fixPriority: FIX_QUEUE_FRONT };
}

export function withDraftPr(item: WorkItem, pr: PrRef): WorkItem {
  return { ...item, draftPr: pr };
}

// Client config decides whether a work item may be fixed without a Fix now action.
export const WorkItemClientConfigSchema = z
  .object({ autoFixAllowed: z.boolean().default(false) })
  .strict();
export type WorkItemClientConfig = z.infer<typeof WorkItemClientConfigSchema>;

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
): Result<Assignee, TriageError> {
  if (assignee === NEEDS_HUMAN) return ok(assignee);
  if (!assignee.startsWith(AGENT_ASSIGNEE_PREFIX)) {
    return err(new TriageError('INVALID_ASSIGNEE', `Invalid assignee: ${assignee}`));
  }
  const agentName = assignee.slice(AGENT_ASSIGNEE_PREFIX.length);
  if (agentName.length === 0 || !agentNames.includes(agentName)) {
    return err(new TriageError('UNKNOWN_AGENT', `Unknown agent assignee: ${assignee}`));
  }
  return ok(agentAssignee(agentName));
}

export function assertTriageAllowed(item: WorkItem): Result<WorkItem, TriageError> {
  if (TERMINAL_WORK_ITEM_STATUSES.some((status) => status === item.status)) {
    return err(new TriageError('TERMINAL_STATUS', `Cannot triage a ${item.status} work item`));
  }
  return ok(item);
}
