import { AgentIdentitySchema } from '@graveshift/agents/routing';
import { PrRefSchema, WorkItemSchema } from '@graveshift/core';
import { z } from 'zod';

export const FixTriggerSchema = z.enum(['auto_fix', 'fix_now']);
export type FixTrigger = z.infer<typeof FixTriggerSchema>;

export const FixFailureSchema = z.enum([
  'none',
  'auto_fix_disabled',
  'context_unavailable',
  'invalid_context',
  'policy_denied',
  'patch_rejected',
  'pr_failed',
  'fix_error',
  'already_fixed',
  'awaiting_answer',
  'needs_human',
  'routing_failed',
  'audit_failed',
  'publication_uncertain',
]);
export type FixFailure = z.infer<typeof FixFailureSchema>;

export const PolicyEffectSchema = z.enum(['allow', 'deny', 'require_approval', 'dry_run']);

export const RoutingOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('routed'), agent: AgentIdentitySchema }).strict(),
  z
    .object({
      kind: z.literal('ask'),
      agent: AgentIdentitySchema,
      questionId: z.string().min(1),
      question: z.string().min(1),
      missing: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('needs_human'),
      agent: z.string().min(1),
      reason: z.string().min(1),
      missing: z.array(z.string().min(1)),
    })
    .strict(),
]);
export type RoutingOutcome = z.infer<typeof RoutingOutcomeSchema>;

const completionFields = {
  effect: PolicyEffectSchema,
  ok: z.boolean(),
  pr: PrRefSchema.nullable(),
  reason: z.string().nullable(),
  failure: FixFailureSchema,
  routing: RoutingOutcomeSchema.nullable(),
};

const completionSchema = z.object(completionFields).strict();

function validCompletion(result: z.infer<typeof completionSchema>): boolean {
  if (result.ok)
    return result.effect === 'allow' && result.failure === 'none' && result.pr !== null;
  return result.failure !== 'none';
}

export const FixCompletionSchema = completionSchema.refine(validCompletion, {
  message: 'The fix outcome fields must agree',
});
export type FixCompletion = z.infer<typeof FixCompletionSchema>;

export const FixResultSchema = z
  .object({
    item: WorkItemSchema,
    trigger: FixTriggerSchema,
    ...completionFields,
    attemptId: z.string().min(1).nullable(),
  })
  .strict()
  .refine(validCompletion, { message: 'The fix outcome fields must agree' });
export type FixResult = z.infer<typeof FixResultSchema>;

export const AutoFixResultSchema = z
  .object({
    ok: z.boolean(),
    effect: PolicyEffectSchema,
    reason: z.string().nullable(),
    failure: FixFailureSchema,
    routing: RoutingOutcomeSchema.nullable(),
    attemptId: z.string().min(1).nullable(),
  })
  .strict()
  .refine(
    (result) =>
      result.ok
        ? result.effect === 'allow' && result.failure === 'none'
        : result.failure !== 'none',
    { message: 'The auto-fix outcome fields must agree' },
  );

export const TriageResultSchema = z
  .object({ item: WorkItemSchema, autoFix: AutoFixResultSchema.nullable() })
  .strict();
export type TriageResult = z.infer<typeof TriageResultSchema>;

export const WorkOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('triage'), result: TriageResultSchema }).strict(),
  z.object({ kind: z.literal('fix'), result: FixResultSchema }).strict(),
]);
export type WorkOutcome = z.infer<typeof WorkOutcomeSchema>;

export function triageResult(fix: FixResult): TriageResult {
  const { ok, effect, reason, failure, routing, attemptId } = fix;
  return { item: fix.item, autoFix: { ok, effect, reason, failure, routing, attemptId } };
}
