import { redact } from '@graveshift/redactor';
import { z } from 'zod';

import { EnvelopeError } from './errors';
import { assertSafeMetadata } from './privacy';
import { EventEnvelopeSchema, type EventEnvelope } from './schemas';

const rawSchema = EventEnvelopeSchema.extend({ payload: z.unknown() });
const metadata = ['id', 'projectId', 'service', 'type', 'traceId', 'fingerprint'] as const;
const sensitiveKey =
  /password|passwd|passphrase|secret|token|authorization|cookie|api[-_ ]?key|access[-_ ]?key|private[-_ ]?key|credential|email|phone/i;

function invalidPayload(): never {
  throw new EnvelopeError('INVALID_JSON_PAYLOAD', 'Event payload must contain only JSON data');
}

function cleanValue(value: unknown, ancestors: WeakSet<object>): unknown {
  if (typeof value === 'string') return redact(value);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : invalidPayload();
  if (typeof value !== 'object' || ancestors.has(value)) return invalidPayload();

  const prototype: unknown = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return invalidPayload();
  }
  if (Object.getOwnPropertySymbols(value).length > 0) return invalidPayload();

  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if (Object.keys(descriptors).length !== value.length + 1) return invalidPayload();
      return Array.from({ length: value.length }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor)) return invalidPayload();
        return cleanValue(descriptor.value, ancestors);
      });
    }
    const entries = Object.entries(descriptors).map(([key, descriptor]) => {
      if (!descriptor.enumerable || !('value' in descriptor)) return invalidPayload();
      return [key, cleanValue(descriptor.value, ancestors)] as const;
    });
    // Drop sensitive fields. Keeping every surviving key unchanged prevents collisions.
    return Object.fromEntries(
      entries.filter(([key]) => !sensitiveKey.test(key) && redact(key) === key),
    );
  } finally {
    ancestors.delete(value);
  }
}

/** Prepare untrusted event data without changing identity or authorized routing metadata. */
export function prepareEnvelope(input: unknown): EventEnvelope {
  try {
    const parsed = rawSchema.safeParse(input);
    if (!parsed.success) {
      throw new EnvelopeError('INVALID_ENVELOPE', 'Malformed event envelope');
    }
    assertSafeMetadata(metadata.map((field) => parsed.data[field]));

    const payload = parsed.data.payload;
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return invalidPayload();
    }
    const serialized = JSON.stringify({
      ...parsed.data,
      source: redact(parsed.data.source),
      payload: cleanValue(payload, new WeakSet()),
    });
    const prepared = EventEnvelopeSchema.safeParse(JSON.parse(serialized));
    if (!prepared.success) {
      throw new EnvelopeError('INVALID_ENVELOPE', 'Malformed event envelope');
    }
    return prepared.data;
  } catch (error) {
    if (error instanceof EnvelopeError) throw error;
    throw new EnvelopeError('INVALID_JSON_PAYLOAD', 'Event data cannot be represented as JSON');
  }
}
