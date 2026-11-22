import { z } from 'zod';

const id = z.string().min(1);
const timestamp = z.iso.datetime();
const subjectToken = /^[A-Za-z0-9_-]+$/;
// A type may span several NATS tokens, but every token must be non-empty.
const subjectType = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

export const EventEnvelopeSchema = z.object({
  id,
  tenantId: z.string().regex(subjectToken),
  source: id,
  service: id,
  type: z.string().regex(subjectType),
  severity: z.enum(['info', 'warning', 'critical']),
  observedAt: timestamp,
  traceId: id,
  fingerprint: id,
  payload: z.record(z.string(), z.unknown()),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const SIGNAL_KINDS = [
  'oom',
  'crash_loop',
  'restart',
  'image_pull_backoff',
  'unhealthy',
] as const;

export const SignalSchema = z.object({
  id,
  service: id,
  kind: z.enum(SIGNAL_KINDS),
  severity: z.enum(['info', 'warning', 'critical']),
  source: z.enum(['docker', 'k8s']),
  fingerprint: id,
  message: z.string(),
  observedAt: timestamp,
});
export type Signal = z.infer<typeof SignalSchema>;

export const INCIDENT_STATES = [
  'open',
  'diagnosing',
  'diagnosed',
  'awaiting_approval',
  'acting',
  'resolved',
  'dismissed',
] as const;
export const IncidentStateSchema = z.enum(INCIDENT_STATES);
export type IncidentState = z.infer<typeof IncidentStateSchema>;

export const DiagnosisSchema = z.object({
  id,
  incidentId: id,
  rootCause: z.string().min(1),
  evidence: z.array(z.object({ ref: id, excerpt: z.string() })).min(1),
  confidence: z.number().min(0).max(1),
  createdAt: timestamp,
});
export type Diagnosis = z.infer<typeof DiagnosisSchema>;

export const IncidentSchema = z.object({
  id,
  service: id,
  state: IncidentStateSchema,
  signalIds: z.array(id).min(1),
  diagnosis: DiagnosisSchema.optional(),
  openedAt: timestamp,
  updatedAt: timestamp,
  lastActionAt: timestamp.optional(),
  resolvedAt: timestamp.optional(),
});
export type Incident = z.infer<typeof IncidentSchema>;

const actionBase = { id, incidentId: id, service: id, proposedAt: timestamp, expiresAt: timestamp };

export const ActionProposalSchema = z.discriminatedUnion('kind', [
  z.object({ ...actionBase, kind: z.literal('restart') }),
  z.object({ ...actionBase, kind: z.literal('scale'), replicas: z.number().int().min(0) }),
]);
export type ActionProposal = z.infer<typeof ActionProposalSchema>;

export const ApprovalSchema = z.object({
  id,
  actionId: id,
  incidentId: id,
  decision: z.enum(['approved', 'rejected']),
  decidedBy: id,
  decidedAt: timestamp,
  expiresAt: timestamp,
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const AuditEntrySchema = z.object({
  seq: z.number().int().min(1),
  at: timestamp,
  actor: id,
  type: id,
  incidentId: id.optional(),
  payload: z.record(z.string(), z.unknown()),
  prevHash: z.string().regex(/^[0-9a-f]{64}$/),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

// Wire shapes shared by the daemon read API and the MCP client. One schema per shape.
export const LimitCountersSchema = z
  .object({
    openPrsLastHour: z.number().finite().nonnegative(),
    actionsLast10Min: z.number().finite().nonnegative(),
    diagnosisLoops: z.number().finite().nonnegative(),
    llmSpentTodayUsd: z.number().finite().nonnegative(),
  })
  .strict();
export type LimitCounters = z.infer<typeof LimitCountersSchema>;

export const CounterSourceSchema = z.enum(['wired', 'not_wired']);
export type CounterSource = z.infer<typeof CounterSourceSchema>;

export const CounterSnapshotSchema = z
  .object({ source: CounterSourceSchema, counters: LimitCountersSchema })
  .strict();
export type CounterSnapshot = z.infer<typeof CounterSnapshotSchema>;

export const ServiceViewSchema = z
  .object({ name: z.string().min(1), status: z.string().min(1) })
  .strict();
export type ServiceView = z.infer<typeof ServiceViewSchema>;

export const IncidentViewSchema = z
  .object({
    incident: z
      .object({
        id,
        service: id,
        state: z.string().min(1),
        diagnosis: z.object({ confidence: z.number() }).catchall(z.unknown()).optional(),
      })
      .catchall(z.unknown()),
    severity: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    detections: z.array(z.object({ rule: z.string().min(1) })).optional(),
    pr: z.object({ url: z.string(), number: z.number(), branch: z.string() }).optional(),
    timeline: z.array(z.object({ at: timestamp, type: z.string(), detail: z.string() })).optional(),
  })
  .loose();
export type IncidentView = z.infer<typeof IncidentViewSchema>;

export const ChainResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), length: z.number().int().nonnegative() }).strict(),
  z
    .object({
      ok: z.literal(false),
      brokenAtSeq: z.number().int().min(1),
      reason: z.string().min(1),
    })
    .strict(),
]);
export type ChainResult = z.infer<typeof ChainResultSchema>;
