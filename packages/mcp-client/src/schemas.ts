import {
  ChainResultSchema,
  CounterSourceSchema,
  IncidentViewsSchema,
  IncidentViewSchema,
  LimitCountersSchema,
  MetricValueSchema,
  ServiceViewsSchema,
} from '@graveshift/core';
import { z } from 'zod';

/**
 * Wire shapes the MCP endpoint returns. Every tool reply passes through the
 * server redactor before it reaches the wire, so fields that hold free text
 * are checked loosely here. `@graveshift/core` owns the shared shapes and this
 * file reuses them unchanged where redaction cannot alter them.
 */

export {
  ChainResultSchema,
  CounterSourceSchema,
  IncidentViewsSchema,
  IncidentViewSchema,
  LimitCountersSchema,
  MetricValueSchema,
  ServiceViewsSchema,
};
export type {
  ChainResult,
  CounterSource,
  IncidentView,
  LimitCounters,
  ServiceView,
} from '@graveshift/core';

const text = z.string();

/**
 * One audit row. `@graveshift/core` owns `AuditEntrySchema`; the hash and the
 * fixed labels are redactor input like any other string, so this view accepts
 * the redacted form. `seq` and `payload` keep the core guarantees.
 */
export const AuditEntryViewSchema = z.object({
  seq: z.number().int().min(1),
  at: text,
  actor: text,
  type: text,
  incidentId: text.optional(),
  payload: z.record(z.string(), z.unknown()),
  prevHash: text,
  hash: text,
});
export type AuditEntryView = z.infer<typeof AuditEntryViewSchema>;
export const AuditEntryViewsSchema = z.array(AuditEntryViewSchema);

/**
 * One recorded diagnosis, read through `get_diagnosis`. The API stores the
 * daemon value as untrusted data (`mcp.backend.ts`), so every field stays open.
 */
export const DiagnosisViewSchema = z.object({}).catchall(z.unknown());
export type DiagnosisView = Record<string, unknown>;

/** The policy package fixes these values (`packages/policy`). */
export const PolicyEffectSchema = z.enum(['allow', 'deny', 'require_approval', 'dry_run']);
export type PolicyEffect = z.infer<typeof PolicyEffectSchema>;
export const PolicyModeSchema = z.enum(['dry-run', 'propose', 'act']);
export type PolicyMode = z.infer<typeof PolicyModeSchema>;

/** One `PolicyDecision` from `decide()` in `packages/policy`. */
export const PolicyDecisionSchema = z.object({
  effect: PolicyEffectSchema,
  reason: text,
  matchedRule: text.nullable(),
  mode: PolicyModeSchema,
  reasons: z.array(text),
  warnings: z.array(text),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

/** The audit event `toAuditEvent()` builds beside the decision. */
export const PolicyAuditEventSchema = z.object({
  actor: z.literal('policy'),
  type: z.literal('policy.decision'),
  payload: z.record(z.string(), z.unknown()),
});
export type PolicyAuditEvent = z.infer<typeof PolicyAuditEventSchema>;

/** The `policy.limits` block the reply echoes (`packages/policy/src/schema.ts`). */
export const PolicyLimitsSchema = z.object({
  maxOpenPrsPerHour: z.number().int().min(0),
  maxActionsPerServicePer10Min: z.number().int().min(0),
  maxDiagnosisLoops: z.number().int().min(0),
  llmDailyBudgetUsd: z.number().min(0),
});
export type PolicyLimits = z.infer<typeof PolicyLimitsSchema>;

/**
 * The `propose_fix` reply from `apps/api/src/mcp/mcp.tools.ts`. `executed` is
 * always false: the tool decides and never runs an action.
 */
export const ProposeFixResultSchema = z.object({
  decision: PolicyDecisionSchema,
  audit: PolicyAuditEventSchema,
  executed: z.literal(false),
  limits: z.object({
    enforced: z.boolean(),
    source: CounterSourceSchema,
    counters: LimitCountersSchema,
    configured: PolicyLimitsSchema,
    reason: z.string().optional(),
  }),
});
export type ProposeFixResult = z.infer<typeof ProposeFixResultSchema>;
