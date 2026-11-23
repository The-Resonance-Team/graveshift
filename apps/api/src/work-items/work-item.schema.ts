import { PrRefSchema, WorkItemSchema } from '@graveshift/core';
import { z } from 'zod';

// Zod stays only for OpenAPI response documentation. Request DTOs own validation.
export const workItemListResponseSchema = z.object({
  items: z.array(WorkItemSchema),
  total: z.number().int().min(0),
  offset: z.number().int().min(0),
  limit: z.number().int().min(1),
});
export type WorkItemListResponse = z.infer<typeof workItemListResponseSchema>;

const fixFailureCodeSchema = z.enum([
  'none',
  'auto_fix_disabled',
  'context_unavailable',
  'invalid_context',
  'policy_denied',
  'source_unavailable',
  'patch_rejected',
  'checks_failed',
  'stale_base',
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
