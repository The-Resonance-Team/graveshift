import {
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEnvelopeSchema, type EventEnvelope } from '@graveshift/core';
import { redact } from '@graveshift/redactor';
import type { Publisher } from '@graveshift/events';
import { randomUUID } from 'node:crypto';

import { EVENT_PUBLISHER, type VerifiedCredential } from '../auth.types';
import type { SentryParamsDto } from '../dto/sentry-params.dto';
import { isSentryEventId, isJsonObject, mapSentryEvent } from '../sentry-event.mapper';
import {
  parseSentryEnvelope,
  SentryEnvelopeParseError,
  SentryEnvelopeTooLargeError,
} from '../sentry-envelope.parser';

const SENSITIVE_FIELD = /authorization|cookie|password|secret|token|api[_-]?key|credential/i;

function redactValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redact(value);
  if (depth >= 64) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_FIELD.test(key) ? '[REDACTED]' : redactValue(item, depth + 1),
      ]),
    );
  }
  return value;
}

@Injectable()
export class SentryIngestService {
  constructor(@Inject(EVENT_PUBLISHER) private readonly publisher: Publisher) {}

  async ingest(
    params: SentryParamsDto,
    body: Buffer,
    credential: VerifiedCredential,
  ): Promise<{ id: string }> {
    if (credential.projectId !== params.projectId || !credential.service) {
      throw new UnprocessableEntityException('The Sentry Credential binding is invalid');
    }

    let envelope;
    try {
      envelope = parseSentryEnvelope(body);
    } catch (error) {
      if (error instanceof SentryEnvelopeTooLargeError) throw new PayloadTooLargeException();
      if (error instanceof SentryEnvelopeParseError) {
        throw new UnprocessableEntityException('Malformed Sentry envelope');
      }
      throw error;
    }

    const eventItem = envelope.items.find((item) => item.type === 'event');
    if (!eventItem) return { id: randomUUID().replaceAll('-', '') };
    const headerId = envelope.header.event_id;
    const id = headerId && isSentryEventId(headerId) ? headerId : randomUUID().replaceAll('-', '');
    if (!isJsonObject(eventItem.payload)) {
      throw new UnprocessableEntityException('Malformed Sentry event');
    }

    let mapped: EventEnvelope;
    try {
      mapped = mapSentryEvent(eventItem.payload, envelope.header, credential, id);
    } catch {
      throw new UnprocessableEntityException('Malformed Sentry event');
    }
    const safe = {
      ...mapped,
      type: redact(mapped.type),
      fingerprint: redact(mapped.fingerprint),
      payload: redactValue(mapped.payload) as Record<string, unknown>,
    };
    const parsed = EventEnvelopeSchema.safeParse(safe);
    if (!parsed.success) throw new UnprocessableEntityException('Malformed Sentry event');

    await this.publisher.publish(parsed.data);
    return { id: parsed.data.id };
  }
}
