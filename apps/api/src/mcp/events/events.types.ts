import type { EventEnvelope } from '@graveshift/core';
import { z } from 'zod';

import { MCP_READ_SCOPES } from '../../auth/scopes';

/** Injection token. The source is a port; the poll service owns the wire rules. */
export const MCP_EVENT_SOURCE = Symbol('MCP_EVENT_SOURCE');

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
  parsePayload(value: Record<string, unknown>): Record<string, unknown>;
  payloadFrom(envelope: EventEnvelope): Record<string, unknown>;
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

const serviceFilter = {
  type: 'object',
  properties: {
    service: { type: 'string', description: 'Only events for this Grave.' },
    severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
  },
  additionalProperties: false,
} as const;

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
    inputSchema: serviceFilter,
    payloadSchema: z.toJSONSchema(PAYLOADS[name]),
    parsePayload: (value) => PAYLOADS[name].parse(value),
    payloadFrom: PICK[name],
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
