import { AssigneeSchema, PrRefSchema, WorkItemSchema } from '@graveshift/core';
import { z } from 'zod';

export const workItemParamsSchema = z.object({ id: z.string().min(1) }).strict();
export type WorkItemParams = z.infer<typeof workItemParamsSchema>;

export const listWorkItemsQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type ListWorkItemsQuery = z.infer<typeof listWorkItemsQuerySchema>;

export const workItemListResponseSchema = z.object({
  items: z.array(WorkItemSchema),
  total: z.number().int().min(0),
  offset: z.number().int().min(0),
  limit: z.number().int().min(1),
});
export type WorkItemListResponse = z.infer<typeof workItemListResponseSchema>;

export const triageRequestSchema = z.object({ assignee: AssigneeSchema }).strict();
export type TriageRequest = z.infer<typeof triageRequestSchema>;

// A Fix now request may carry a short human note. It never grants permission.
export const fixNowRequestSchema = z
  .object({ note: z.string().min(1).max(500).optional() })
  .strict();
export type FixNowRequest = z.infer<typeof fixNowRequestSchema>;

const fixFailureCodeSchema = z.enum([
  'none',
  'auto_fix_disabled',
  'context_unavailable',
  'invalid_context',
  'policy_denied',
  'patch_rejected',
  'pr_failed',
  'fix_error',
  'already_fixed',
]);

const policyEffectSchema = z.enum(['allow', 'deny', 'require_approval', 'dry_run']);

// The full result is returned so a client can tell a denial from a started fix.
export const fixResultSchema = z
  .object({
    item: WorkItemSchema,
    trigger: z.enum(['auto_fix', 'fix_now']),
    effect: policyEffectSchema,
    ok: z.boolean(),
    pr: PrRefSchema.nullable(),
    reason: z.string().nullable(),
    failure: fixFailureCodeSchema,
  })
  .strict();
export type FixResultResponse = z.infer<typeof fixResultSchema>;

// Triage is the auto-fix trigger. Its result carries the fix outcome, including
// a denial reason, so a failed auto-fix never hides the saved triage state.
export const triageResultSchema = z
  .object({
    item: WorkItemSchema,
    autoFix: z
      .object({
        ok: z.boolean(),
        effect: policyEffectSchema,
        reason: z.string().nullable(),
        failure: fixFailureCodeSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();
export type TriageResultResponse = z.infer<typeof triageResultSchema>;
