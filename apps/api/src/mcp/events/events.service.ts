import { Inject, Injectable } from '@nestjs/common';
import { ProtocolError } from '@modelcontextprotocol/server';
import { redact } from '@graveshift/redactor';
import {
  EVENT_TYPES,
  findEventType,
  MCP_EVENT_SOURCE,
  type EventReadResult,
  type EventOccurrence,
  type EventFilter,
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

/**
 * Nonsecret identity metadata (ADR 0019). These values keep their text so an
 * event stays the same across retries, serialization and MCP output. Every
 * other string — including payload free text — is still redacted.
 */
const IDENTITY_KEYS = new Set([
  'eventId',
  'incidentId',
  'traceId',
  'fingerprint',
  'id',
  'projectId',
  'service',
  'type',
  'name',
  'timestamp',
]);

function redactOccurrence<T>(value: T, key?: string): T {
  if (typeof value === 'string') {
    return (key !== undefined && IDENTITY_KEYS.has(key) ? value : redact(value)) as T;
  }
  if (Array.isArray(value)) return value.map((item) => redactOccurrence(item)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, item]) => [
        redact(entryKey),
        redactOccurrence(item, entryKey),
      ]),
    ) as T;
  }
  return value;
}

export interface PollParams {
  name: string;
  arguments?: Record<string, unknown> | undefined;
  cursor?: string | null | undefined;
  maxAgeMs?: number | undefined;
  maxEvents?: number | undefined;
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
    projectId?: string,
  ): Promise<EventPollResult> {
    const descriptor = findEventType(params.name);
    if (!descriptor) throw new ProtocolError(NOT_FOUND, 'NotFound', { kind: 'event' });
    if (!scopes.includes(descriptor.scope)) {
      throw new ProtocolError(FORBIDDEN, 'Forbidden', { reason: 'scope', scope: descriptor.scope });
    }

    const args = descriptor.arguments(params.arguments ?? {});

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
    await this.scan(state, descriptor, args, floor, maxEvents, window, projectId);

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
    args: EventFilter,
    floor: number | undefined,
    maxEvents: number,
    window: number,
    projectId: string | undefined,
  ): Promise<void> {
    const read = await this.source.read(state.scanCursor, window);
    state.last = read;
    state.truncated ||= read.truncated;
    const progress = state.scanCursor === null ? 0 : read.scannedThroughSeq - state.scanCursor;
    state.scannedTotal += Math.max(progress, 0);

    for (const stored of read.events) {
      if (!this.matches(stored, descriptor, args, projectId)) continue;
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
    return this.scan(state, descriptor, args, floor, maxEvents, window, projectId);
  }

  /** Project isolation plus the descriptor's declared type, service and severity filter. */
  private matches(
    stored: StoredEvent,
    descriptor: EventTypeDescriptor,
    args: EventFilter,
    projectId: string | undefined,
  ): boolean {
    if (projectId !== undefined && stored.envelope.projectId !== projectId) return false;
    return descriptor.matches(stored.envelope, args);
  }

  /** Stable identity and declared payload fields, then redaction of untrusted text. */
  private toOccurrence(stored: StoredEvent, descriptor: EventTypeDescriptor): EventOccurrence {
    const { envelope } = stored;
    return redactOccurrence(descriptor.occurrence(envelope));
  }
}
