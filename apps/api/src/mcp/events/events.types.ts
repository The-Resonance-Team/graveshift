import { prepareEnvelope, type EventEnvelope } from '@graveshift/core';
import { ProtocolError } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { MCP_READ_SCOPES } from '../../auth/scopes';

/** Injection token. The source is a port; the poll service owns the wire rules. */
export const MCP_EVENT_SOURCE = Symbol('MCP_EVENT_SOURCE');

/** Read-only port over closed Deployments. No per-poll timeout: closure is final. */
export const CLOSED_DEPLOYMENTS = Symbol('CLOSED_DEPLOYMENTS');
export interface ClosedDeploymentKey {
  deploymentId: string;
  environment: string;
}
export interface ClosedDeploymentQuery {
  listClosed(projectId: string): Promise<ClosedDeploymentKey[]>;
}

/** Six MCP scopes serve as Event scopes. One event type declares one of them. */
export type EventScope = (typeof MCP_READ_SCOPES)[number];

/** One event type as SEP-3415 lists it, plus the scope that guards its poll. */
export interface EventTypeDescriptor {
  name: string;
  description: string;
  delivery: readonly ['poll'];
  inputSchema: Record<string, unknown>;
  payloadSchema: Record<string, unknown>;
  scope: EventScope;
  arguments(input: Record<string, unknown>): EventFilter;
  matches(envelope: EventEnvelope, filter: EventFilter): boolean;
  occurrence(envelope: EventEnvelope): EventOccurrence;
}

export interface EventOccurrence {
  eventId: string;
  name: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/** One stored occurrence. `seq` is the JetStream stream position used as cursor. */
export interface StoredEvent {
  seq: number;
  envelope: EventEnvelope;
}

export interface EventReadResult {
  firstSeq: number;
  headSeq: number;
  scannedThroughSeq: number;
  events: StoredEvent[];
  /** True when the cursor fell below the retained window. */
  truncated: boolean;
}

/** Reads a bounded window from the JetStream stream. No state per client. */
export interface EventSource {
  read(afterSeq: number | null, maxEvents: number): Promise<EventReadResult>;
}

const EventFilterSchema = z.strictObject({
  service: z.string().describe('Only events for this Grave.').optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  deploymentId: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .describe('Only events stamped with this deployed commit SHA.')
    .optional(),
  environment: z.string().describe('Only events for this Environment name.').optional(),
});
export type EventFilter = z.infer<typeof EventFilterSchema>;

const text = () => z.string().catch('');
const count = () => z.number().catch(0);

/** One Zod shape per event type. The wire schema comes from the same shape. */
const PAYLOADS = {
  'incident.changed': z.object({
    incidentId: text(),
    service: text(),
    state: text(),
    severity: text(),
  }),
  'diagnosis.ready': z.object({
    incidentId: text(),
    rootCause: text(),
    confidence: count(),
  }),
  'audit.entry': z.object({ seq: count(), kind: text(), summary: text() }),
  'log.entry': z.object({ service: text(), level: text(), message: text() }),
  'metric.sample': z.object({ service: text(), name: text(), value: count() }),
  'fix.proposed': z.object({ incidentId: text(), action: text(), decision: text() }),
} as const;

type PayloadName = keyof typeof PAYLOADS;

/** Pull the declared fields from the envelope. Values stay untrusted. */
const PICK: Record<PayloadName, (envelope: EventEnvelope) => Record<string, unknown>> = {
  'incident.changed': (e) => ({
    incidentId: e.payload.incidentId ?? e.id,
    service: e.service,
    state: e.payload.state ?? 'open',
    severity: e.severity,
  }),
  'diagnosis.ready': (e) => ({
    incidentId: e.payload.incidentId ?? e.id,
    rootCause: e.payload.rootCause,
    confidence: e.payload.confidence,
  }),
  'audit.entry': (e) => ({
    seq: e.payload.seq,
    kind: e.payload.kind ?? e.type,
    summary: e.payload.summary,
  }),
  'log.entry': (e) => ({ service: e.service, level: e.severity, message: e.payload.message }),
  'metric.sample': (e) => ({
    service: e.service,
    name: e.payload.name ?? e.type,
    value: e.payload.value,
  }),
  'fix.proposed': (e) => ({
    incidentId: e.payload.incidentId ?? e.id,
    action: e.payload.action,
    decision: e.payload.decision,
  }),
};

function descriptor(
  name: PayloadName,
  description: string,
  scope: EventScope,
): EventTypeDescriptor {
  return {
    name,
    description,
    delivery: ['poll'],
    scope,
    inputSchema: z.toJSONSchema(EventFilterSchema),
    payloadSchema: z.toJSONSchema(PAYLOADS[name]),
    arguments(input) {
      const parsed = EventFilterSchema.safeParse(input);
      if (!parsed.success) {
        throw new ProtocolError(-32602, 'InvalidParams', { reason: 'arguments' });
      }
      return parsed.data;
    },
    matches(envelope, filter) {
      return (
        eventTypeFor(envelope) === name &&
        (filter.service === undefined || filter.service === envelope.service) &&
        (filter.severity === undefined || filter.severity === envelope.severity) &&
        (filter.deploymentId === undefined || filter.deploymentId === envelope.deploymentId) &&
        (filter.environment === undefined || filter.environment === envelope.environment)
      );
    },
    occurrence(input) {
      const envelope = prepareEnvelope(input);
      return {
        eventId: envelope.id,
        name,
        timestamp: envelope.observedAt,
        data: PAYLOADS[name].parse(PICK[name](envelope)),
      };
    },
  };
}

/**
 * The static v2 catalog. `listChanged` stays false; dynamic types are v3.
 * The prefix maps a normalised envelope type to one event type.
 */
export const EVENT_TYPES: readonly EventTypeDescriptor[] = [
  descriptor(
    'incident.changed',
    'Fires when a Grave records a signal or changes state.',
    'incidents:read',
  ),
  descriptor('diagnosis.ready', 'Fires when a Haunting gets a diagnosis.', 'diagnoses:read'),
  descriptor('audit.entry', 'Fires when the audit log gets an entry.', 'audit:read'),
  descriptor('log.entry', 'Fires when a Grave emits a log line.', 'logs:read'),
  descriptor('metric.sample', 'Fires when a metric sample is recorded.', 'metrics:read'),
  descriptor('fix.proposed', 'Fires when a fix is proposed but never executed.', 'fix:propose'),
];

const PREFIX_TO_EVENT: Record<string, string> = {
  signal: 'incident.changed',
  incident: 'incident.changed',
  diagnosis: 'diagnosis.ready',
  audit: 'audit.entry',
  log: 'log.entry',
  metric: 'metric.sample',
  fix: 'fix.proposed',
};

/** Map a normalised envelope to a catalog name. Unknown types are not served. */
export function eventTypeFor(envelope: EventEnvelope): string | undefined {
  return PREFIX_TO_EVENT[envelope.type.split('.')[0] ?? ''];
}

export function findEventType(name: string): EventTypeDescriptor | undefined {
  return EVENT_TYPES.find((entry) => entry.name === name);
}
