import {
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEnvelopeSchema, type EventEnvelope } from '@graveshift/core';
import { redact } from '@graveshift/redactor';
import type { Publisher } from '@graveshift/events';

import { EVENT_PUBLISHER, type VerifiedCredential } from '../auth.types';
import type { PublishEventDto } from '../dto/publish-event.dto';
import { EVENTS_PUBLISH_SCOPE } from '../scopes';

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item)]));
  }
  return value;
}

/** Validates, redacts and publishes plugin events. */
@Injectable()
export class EventIngestService {
  constructor(@Inject(EVENT_PUBLISHER) private readonly publisher: Publisher) {}

  async ingest(
    body: PublishEventDto,
    principal: VerifiedCredential,
  ): Promise<{ accepted: true; id: string }> {
    if (!principal.scopes.includes(EVENTS_PUBLISH_SCOPE)) throw new ForbiddenException();
    if (principal.tenantId !== body.tenantId) throw new ForbiddenException('Tenant binding failed');
    if (principal.service !== null && principal.service !== body.service) {
      throw new ForbiddenException('Service binding failed');
    }

    // The core schema is the source of truth for the envelope shape.
    const parsed = EventEnvelopeSchema.safeParse(body);
    if (!parsed.success) throw new UnprocessableEntityException('Malformed event envelope');

    // Every string is redacted, including ids, type, source and the payload.
    const envelope = redactValue(parsed.data) as EventEnvelope;
    await this.publisher.publish(envelope);
    return { accepted: true, id: envelope.id };
  }
}
