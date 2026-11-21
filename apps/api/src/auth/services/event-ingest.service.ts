import {
  ForbiddenException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEnvelopeSchema } from '@graveshift/core';
import type { Publisher } from '@graveshift/events';
import { redact } from '@graveshift/redactor';

import {
  CREDENTIAL_CONFIG,
  EVENT_PUBLISHER,
  type AuthConfig,
  type VerifiedCredential,
} from '../auth.types';
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

/** Validates, bounds, redacts and publishes plugin events. */
@Injectable()
export class EventIngestService {
  constructor(
    @Inject(EVENT_PUBLISHER) private readonly publisher: Publisher,
    @Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig,
  ) {}

  async ingest(
    body: PublishEventDto,
    principal: VerifiedCredential,
  ): Promise<{ accepted: true; id: string }> {
    if (!principal.scopes.includes(EVENTS_PUBLISH_SCOPE)) throw new ForbiddenException();
    if (principal.tenantId !== body.tenantId) throw new ForbiddenException('Tenant binding failed');
    if (principal.service !== null && principal.service !== body.service) {
      throw new ForbiddenException('Service binding failed');
    }
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > this.config.maxEventBytes) {
      throw new PayloadTooLargeException();
    }

    // The core schema is the source of truth for the envelope shape.
    const parsed = EventEnvelopeSchema.safeParse(body);
    if (!parsed.success) throw new UnprocessableEntityException('Malformed event envelope');

    const envelope = {
      ...parsed.data,
      payload: redactValue(parsed.data.payload) as Record<string, unknown>,
    };
    await this.publisher.publish(envelope);
    return { accepted: true, id: envelope.id };
  }
}
