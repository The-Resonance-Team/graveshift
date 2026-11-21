import type { EventEnvelope } from '@graveshift/core';

/** Injection tokens. The source is a port; the poll service owns the wire rules. */
export const MCP_EVENT_SOURCE = Symbol('MCP_EVENT_SOURCE');

/** The six read scopes from ticket 47. One event type declares one of them. */
export const EVENT_SCOPES = [
  'incidents:read',
  'diagnoses:read',
  'audit:read',
  'logs:read',
  'metrics:read',
  'fix:propose',
] as const;

export type EventScope = (typeof EVENT_SCOPES)[number];

/** One event type as SEP-3415 lists it, plus the scope that guards its poll. */
export interface EventTypeDescriptor {
  name: string;
  description: string;
  delivery: readonly ['poll'];
  inputSchema: Record<string, unknown>;
  payloadSchema: Record<string, unknown>;
  scope: EventScope;
}

/** One stored occurrence. `seq` is the JetStream stream position used as cursor. */
export interface StoredEvent {
  seq: number;
  envelope: EventEnvelope;
}

export interface EventReadResult {
  headSeq: number;
  events: StoredEvent[];
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

const textPayload = (fields: string[]) => ({
  type: 'object',
  properties: Object.fromEntries(fields.map((field) => [field, { type: 'string' }])),
  additionalProperties: false,
});

/**
 * The static v2 catalog. `listChanged` stays false; dynamic types are v3.
 * The prefix maps a normalised envelope type to one event type.
 */
export const EVENT_TYPES: readonly EventTypeDescriptor[] = [
  {
    name: 'incident.changed',
    description: 'Fires when a Grave records a signal or changes incident state.',
    delivery: ['poll'],
    scope: 'incidents:read',
    inputSchema: serviceFilter,
    payloadSchema: textPayload(['incidentId', 'service', 'state', 'severity']),
  },
  {
    name: 'diagnosis.ready',
    description: 'Fires when a Haunting gets a diagnosis.',
    delivery: ['poll'],
    scope: 'diagnoses:read',
    inputSchema: serviceFilter,
    payloadSchema: textPayload(['incidentId', 'rootCause', 'confidence']),
  },
  {
    name: 'audit.entry',
    description: 'Fires when the audit log gets an entry.',
    delivery: ['poll'],
    scope: 'audit:read',
    inputSchema: serviceFilter,
    payloadSchema: textPayload(['seq', 'kind', 'summary']),
  },
  {
    name: 'log.entry',
    description: 'Fires when a Grave emits a log line.',
    delivery: ['poll'],
    scope: 'logs:read',
    inputSchema: serviceFilter,
    payloadSchema: textPayload(['service', 'level', 'message']),
  },
  {
    name: 'metric.sample',
    description: 'Fires when a metric sample is recorded.',
    delivery: ['poll'],
    scope: 'metrics:read',
    inputSchema: serviceFilter,
    payloadSchema: textPayload(['service', 'name', 'value']),
  },
  {
    name: 'fix.proposed',
    description: 'Fires when a fix is proposed but never executed.',
    delivery: ['poll'],
    scope: 'fix:propose',
    inputSchema: serviceFilter,
    payloadSchema: textPayload(['incidentId', 'action', 'decision']),
  },
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
