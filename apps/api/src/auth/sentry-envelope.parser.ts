const MAX_ENVELOPE_BYTES = 1_048_576;
const MAX_EVENT_ITEM_BYTES = 1_048_576;

export interface SentryEnvelopeHeader {
  event_id?: string;
  dsn?: string;
  sent_at?: string;
}

export interface SentryEnvelopeItem {
  type: string;
  payload?: unknown;
}

export interface SentryEnvelope {
  header: SentryEnvelopeHeader;
  items: SentryEnvelopeItem[];
}

export class SentryEnvelopeParseError extends Error {}
export class SentryEnvelopeTooLargeError extends Error {}

function jsonObject(line: Buffer): Record<string, unknown> {
  const text = line.toString('utf8');
  if (line.includes(13) || text !== text.trim()) {
    throw new SentryEnvelopeParseError('Envelope headers cannot have surrounding whitespace');
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Convert JSON parse errors into the protocol error below.
  }
  throw new SentryEnvelopeParseError('Envelope headers must be JSON objects');
}

function lineEnd(body: Buffer, start: number): number {
  const end = body.indexOf(10, start);
  return end < 0 ? body.length : end;
}

function eventPayload(bytes: Buffer): unknown {
  if (bytes.length > MAX_EVENT_ITEM_BYTES) throw new SentryEnvelopeTooLargeError();
  try {
    const payload: unknown = JSON.parse(bytes.toString('utf8'));
    if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) return payload;
  } catch {
    // Invalid JSON is reported as a malformed Sentry event below.
  }
  throw new SentryEnvelopeParseError('Event items must contain a JSON object');
}

export function readSentryEnvelopeHeader(body: Buffer): SentryEnvelopeHeader {
  const end = lineEnd(body, 0);
  const header = jsonObject(body.subarray(0, end));
  return {
    ...(typeof header.event_id === 'string' ? { event_id: header.event_id } : {}),
    ...(typeof header.dsn === 'string' ? { dsn: header.dsn } : {}),
    ...(typeof header.sent_at === 'string' ? { sent_at: header.sent_at } : {}),
  };
}

export function parseSentryEnvelope(body: Buffer): SentryEnvelope {
  if (body.length > MAX_ENVELOPE_BYTES) throw new SentryEnvelopeTooLargeError();
  const envelopeEnd = lineEnd(body, 0);
  const rawHeader = jsonObject(body.subarray(0, envelopeEnd));
  const header: SentryEnvelopeHeader = {
    ...(typeof rawHeader.event_id === 'string' ? { event_id: rawHeader.event_id } : {}),
    ...(typeof rawHeader.dsn === 'string' ? { dsn: rawHeader.dsn } : {}),
    ...(typeof rawHeader.sent_at === 'string' ? { sent_at: rawHeader.sent_at } : {}),
  };
  const items: SentryEnvelopeItem[] = [];
  let cursor = envelopeEnd === body.length ? body.length : envelopeEnd + 1;

  while (cursor < body.length) {
    const itemEnd = lineEnd(body, cursor);
    if (itemEnd === cursor) throw new SentryEnvelopeParseError('Item headers cannot be empty');
    const itemHeader = jsonObject(body.subarray(cursor, itemEnd));
    if (typeof itemHeader.type !== 'string' || itemHeader.type.length === 0) {
      throw new SentryEnvelopeParseError('Every item needs a type');
    }
    cursor = itemEnd === body.length ? body.length : itemEnd + 1;

    let payloadEnd: number;
    if (itemHeader.length === undefined) {
      payloadEnd = lineEnd(body, cursor);
    } else {
      if (!Number.isSafeInteger(itemHeader.length) || (itemHeader.length as number) < 0) {
        throw new SentryEnvelopeParseError('Item length must be a non-negative integer');
      }
      payloadEnd = cursor + (itemHeader.length as number);
      if (payloadEnd > body.length)
        throw new SentryEnvelopeParseError('Item payload is incomplete');
      if (payloadEnd < body.length && body[payloadEnd] !== 10) {
        throw new SentryEnvelopeParseError('Length-prefixed items must end with a newline');
      }
    }

    const payload = body.subarray(cursor, payloadEnd);
    const type = itemHeader.type;
    if (type === 'event') {
      items.push({ type, payload: eventPayload(payload) });
    } else {
      items.push({ type });
    }
    cursor = payloadEnd === body.length ? body.length : payloadEnd + 1;
  }

  if (items.filter((item) => item.type === 'event').length > 1) {
    throw new SentryEnvelopeParseError('An envelope can contain only one event item');
  }
  return { header, items };
}
