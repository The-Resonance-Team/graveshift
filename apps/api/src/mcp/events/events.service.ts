import { Inject, Injectable } from '@nestjs/common';
import { ProtocolError } from '@modelcontextprotocol/server';

import { deepRedact } from '../mcp.redact';
import {
  eventTypeFor,
  EVENT_TYPES,
  findEventType,
  MCP_EVENT_SOURCE,
  type EventSource,
  type EventTypeDescriptor,
  type StoredEvent,
} from './events.types';

const NOT_FOUND = -32023;
const FORBIDDEN = -32024;
const INVALID_PARAMS = -32602;
const DEFAULT_MAX_EVENTS = 50;
const MAX_EVENTS_CEILING = 200;
const NEXT_POLL_MS = 30_000;

export interface PollParams {
  name: string;
  arguments?: Record<string, unknown> | undefined;
  cursor?: string | null | undefined;
  maxAgeMs?: number | undefined;
  maxEvents?: number | undefined;
}

interface EventOccurrence {
  eventId: string;
  name: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface EventListResult {
  resultType: 'complete';
  events: Array<{
    name: string;
    description: string;
    delivery: readonly ['poll'];
    inputSchema: Record<string, unknown>;
    payloadSchema: Record<string, unknown>;
  }>;
}

export interface EventPollResult {
  resultType: 'complete';
  events: EventOccurrence[];
  cursor: string;
  truncated: boolean;
  hasMore: boolean;
  nextPollMs: number;
}

function encodeCursor(seq: number): string {
  return Buffer.from(`seq:${seq}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): number {
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  const match = /^seq:(\d+)$/.exec(text);
  if (!match) throw new ProtocolError(INVALID_PARAMS, 'InvalidParams', { reason: 'cursor' });
  return Number(match[1]);
}

function validateArguments(descriptor: EventTypeDescriptor, args: Record<string, unknown>): void {
  const schema = descriptor.inputSchema as {
    properties?: Record<string, { type?: string; enum?: string[] }>;
  };
  for (const [key, value] of Object.entries(args)) {
    const rule = schema.properties?.[key];
    if (!rule) throw new ProtocolError(INVALID_PARAMS, 'InvalidParams', { reason: 'arguments' });
    if (rule.type === 'string' && typeof value !== 'string') {
      throw new ProtocolError(INVALID_PARAMS, 'InvalidParams', { reason: 'arguments' });
    }
    if (rule.enum && !rule.enum.includes(String(value))) {
      throw new ProtocolError(INVALID_PARAMS, 'InvalidParams', { reason: 'arguments' });
    }
  }
}

/** Implements the two v2 Events methods. Payloads are untrusted and get redacted. */
@Injectable()
export class EventPollService {
  constructor(@Inject(MCP_EVENT_SOURCE) private readonly source: EventSource) {}

  list(): EventListResult {
    return {
      resultType: 'complete',
      events: EVENT_TYPES.map((type) => ({
        name: type.name,
        description: type.description,
        delivery: type.delivery,
        inputSchema: type.inputSchema,
        payloadSchema: type.payloadSchema,
      })),
    };
  }

  async poll(params: PollParams, scopes: readonly string[]): Promise<EventPollResult> {
    const descriptor = findEventType(params.name);
    if (!descriptor) throw new ProtocolError(NOT_FOUND, 'NotFound', { kind: 'event' });
    if (!scopes.includes(descriptor.scope)) {
      throw new ProtocolError(FORBIDDEN, 'Forbidden', { reason: 'scope', scope: descriptor.scope });
    }

    const args = params.arguments ?? {};
    validateArguments(descriptor, args);

    const bootstrap = params.cursor === null || params.cursor === undefined;
    const afterSeq = bootstrap ? null : decodeCursor(params.cursor as string);
    const maxEvents = Math.min(params.maxEvents ?? DEFAULT_MAX_EVENTS, MAX_EVENTS_CEILING);
    if (maxEvents < 1)
      throw new ProtocolError(INVALID_PARAMS, 'InvalidParams', { reason: 'maxEvents' });

    const read = await this.source.read(afterSeq, maxEvents + 1);
    const floor =
      !bootstrap && params.maxAgeMs !== undefined ? Date.now() - params.maxAgeMs : undefined;

    let truncated = false;
    const seen = new Set<string>();
    const occurrences: Array<{ occurrence: EventOccurrence; seq: number }> = [];
    for (const stored of read.events) {
      if (!this.matches(stored, descriptor, args)) continue;
      if (floor !== undefined && Date.parse(stored.envelope.observedAt) < floor) {
        truncated = true;
        continue;
      }
      if (seen.has(stored.envelope.id)) continue;
      seen.add(stored.envelope.id);
      occurrences.push({ occurrence: this.toOccurrence(stored, descriptor), seq: stored.seq });
    }

    const hasMore = occurrences.length > maxEvents;
    const page = occurrences.slice(0, maxEvents);
    const cursorSeq = page.length > 0 ? page[page.length - 1]!.seq : read.headSeq;
    return {
      resultType: 'complete',
      events: page.map((item) => item.occurrence),
      cursor: encodeCursor(cursorSeq),
      truncated,
      hasMore,
      nextPollMs: NEXT_POLL_MS,
    };
  }

  private matches(
    stored: StoredEvent,
    descriptor: EventTypeDescriptor,
    args: Record<string, unknown>,
  ): boolean {
    if (eventTypeFor(stored.envelope) !== descriptor.name) return false;
    if (typeof args.service === 'string' && args.service !== stored.envelope.service) return false;
    if (typeof args.severity === 'string' && args.severity !== stored.envelope.severity) {
      return false;
    }
    return true;
  }

  private toOccurrence(stored: StoredEvent, descriptor: EventTypeDescriptor): EventOccurrence {
    const { envelope } = stored;
    return deepRedact({
      eventId: envelope.id,
      name: descriptor.name,
      timestamp: envelope.observedAt,
      data: { ...envelope.payload, service: envelope.service, severity: envelope.severity },
    });
  }
}
