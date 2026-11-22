import {
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EnvelopeError, prepareEnvelope } from '@graveshift/core';
import type { Publisher } from '@graveshift/events';

import { EVENT_PUBLISHER, type VerifiedCredential } from '../auth.types';
import type { PublishEventDto } from '../dto/publish-event.dto';
import { EVENTS_PUBLISH_SCOPE } from '../scopes';

/** Validates, redacts and publishes plugin events. */
@Injectable()
export class EventIngestService {
  constructor(@Inject(EVENT_PUBLISHER) private readonly publisher: Publisher) {}

  async ingest(
    body: PublishEventDto,
    principal: VerifiedCredential,
  ): Promise<{ accepted: true; id: string }> {
    if (!principal.scopes.includes(EVENTS_PUBLISH_SCOPE)) throw new ForbiddenException();
    if (principal.projectId !== body.projectId)
      throw new ForbiddenException('Project binding failed');
    if (principal.service !== null && principal.service !== body.service) {
      throw new ForbiddenException('Service binding failed');
    }

    const envelope = this.prepare(body);
    await this.publisher.publish(envelope);
    return { accepted: true, id: envelope.id };
  }

  private prepare(body: PublishEventDto) {
    try {
      return prepareEnvelope(body);
    } catch (error) {
      if (error instanceof EnvelopeError) {
        throw new UnprocessableEntityException({
          message: 'Invalid event envelope',
          code: error.code,
        });
      }
      throw error;
    }
  }
}
