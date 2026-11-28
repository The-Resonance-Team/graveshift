import {
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { prepareEnvelope, type EventEnvelope } from '@graveshift/core';
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

    let prepared: EventEnvelope;
    try {
      prepared = prepareEnvelope(
        mapSentryEvent(eventItem.payload, envelope.header, credential, id),
      );
    } catch {
      throw new UnprocessableEntityException('Malformed Sentry event');
    }

    await this.publisher.publish(prepared);
    return { id: prepared.id };
  }
}
