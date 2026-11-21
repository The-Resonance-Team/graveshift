import { Inject, Injectable } from '@nestjs/common';
import { ProtocolError } from '@modelcontextprotocol/server';

import { deepRedact } from '../mcp.redact';
import {
  eventTypeFor,
  EVENT_TYPES,
  findEventType,
  MCP_EVENT_SOURCE,
  type EventReadResult,
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
// Bound the work in one poll even when a long run of entries does not match.
const SCAN_LIMIT = 10_000;

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

interface ScanState {
  found: Array<{ occurrence: EventOccurrence; seq: number }>;
  seen: Set<string>;
  truncated: boolean;
  scannedTotal: number;
  reachedHead: boolean;
  last: EventReadResult;
  scanCursor: number | null;
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
  /** True when older or purged events were skipped. */
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
  const seq = Number(match[1]);
  if (!Number.isSafeInteger(seq)) {
    throw new ProtocolError(INVALID_PARAMS, 'InvalidParams', { reason: 'cursor' });
  }
  return seq;
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
  /** Test seam: a small window exercises the recursive scan with few entries. */
  windowSize?: number;

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

  async poll(
    params: PollParams,
    scopes: readonly string[],
    tenantId: string,
  ): Promise<EventPollResult> {
    const descriptor = findEventType(params.name);
    if (!descriptor) throw new ProtocolError(NOT_FOUND, 'NotFound', { kind: 'event' });
    if (!tenantId || !scopes.includes(descriptor.scope)) {
      throw new ProtocolError(FORBIDDEN, 'Forbidden', { reason: 'scope', scope: descriptor.scope });
    }

    const args = params.arguments ?? {};
    validateArguments(descriptor, args);

    const bootstrap = typeof params.cursor !== 'string';
    let afterSeq: number | null = null;
    if (typeof params.cursor === 'string') afterSeq = decodeCursor(params.cursor);
    const maxEvents = Math.max(
      1,
      Math.min(params.maxEvents ?? DEFAULT_MAX_EVENTS, MAX_EVENTS_CEILING),
    );
    const floor =
      !bootstrap && params.maxAgeMs !== undefined ? Date.now() - params.maxAgeMs : undefined;

    const state: ScanState = {
      found: [],
      seen: new Set<string>(),
      truncated: false,
      scannedTotal: 0,
      reachedHead: false,
      last: { firstSeq: 0, headSeq: 0, scannedThroughSeq: 0, events: [], truncated: false },
      scanCursor: afterSeq,
    };
    // A wider raw window limits recursion when many entries do not match.
    const window = this.windowSize ?? Math.max(maxEvents + 1, 100);
    await this.scan(state, descriptor, args, floor, maxEvents, window, tenantId);

    const hasMore = state.found.length > maxEvents || !state.reachedHead;
    const page = state.found.slice(0, maxEvents);
    // Advance only over scanned entries. `headSeq` is safe only at the head.
    const cursorSeq =
      page.length > 0
        ? page[page.length - 1]!.seq
        : state.reachedHead
          ? state.last.headSeq
          : state.last.scannedThroughSeq;
    return {
      resultType: 'complete',
      events: page.map((item) => item.occurrence),
      cursor: encodeCursor(cursorSeq),
      truncated: state.truncated,
      hasMore,
      nextPollMs: NEXT_POLL_MS,
    };
  }

  /** Scan one raw window, then continue from the last scanned sequence. */
  private async scan(
    state: ScanState,
    descriptor: EventTypeDescriptor,
    args: Record<string, unknown>,
    floor: number | undefined,
    maxEvents: number,
    window: number,
    tenantId: string,
  ): Promise<void> {
    const read = await this.source.read(state.scanCursor, window);
    state.last = read;
    state.truncated ||= read.truncated;
    const progress = state.scanCursor === null ? 0 : read.scannedThroughSeq - state.scanCursor;
    state.scannedTotal += Math.max(progress, 0);

    for (const stored of read.events) {
      if (!this.matches(stored, descriptor, args, tenantId)) continue;
      if (floor !== undefined && Date.parse(stored.envelope.observedAt) < floor) {
        state.truncated = true;
        continue;
      }
      if (state.seen.has(stored.envelope.id)) continue;
      state.seen.add(stored.envelope.id);
      state.found.push({ occurrence: this.toOccurrence(stored, descriptor), seq: stored.seq });
      if (state.found.length > maxEvents) break;
    }

    state.reachedHead = read.scannedThroughSeq >= read.headSeq;
    if (state.found.length > maxEvents || state.reachedHead || state.scannedTotal >= SCAN_LIMIT) {
      return;
    }
    if (state.scanCursor !== null && read.scannedThroughSeq <= state.scanCursor) return;
    state.scanCursor = read.scannedThroughSeq;
    return this.scan(state, descriptor, args, floor, maxEvents, window, tenantId);
  }

  private matches(
    stored: StoredEvent,
    descriptor: EventTypeDescriptor,
    args: Record<string, unknown>,
    tenantId: string,
  ): boolean {
    if (stored.envelope.tenantId !== tenantId) return false;
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
      data: descriptor.parsePayload(descriptor.payloadFrom(envelope)),
    });
  }
}
