import {
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EnvelopeError, prepareEnvelope } from '@graveshift/core';
import type { Publisher } from '@graveshift/events';

import { AuditRepo } from '../../audit/repo/audit.repo';
import { DeployRepo } from '../../deploys/deploy.repo';
import { EVENT_PUBLISHER, type VerifiedCredential } from '../auth.types';
import type { PublishEventDto } from '../dto/publish-event.dto';
import { EVENTS_PUBLISH_SCOPE } from '../scopes';

/** Validates, binds to a Deployment, redacts and publishes plugin events. */
@Injectable()
export class EventIngestService {
  constructor(
    @Inject(EVENT_PUBLISHER) private readonly publisher: Publisher,
    private readonly deploys: DeployRepo,
    private readonly audit: AuditRepo,
  ) {}

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

    // The lookup is bounded by the authenticated Project. A client can never borrow
    // another Project's Deployment by supplying its SHA.
    const deployment =
      body.deploymentId === null ||
      body.deploymentId === undefined ||
      body.environment === null ||
      body.environment === undefined
        ? undefined
        : await this.deploys.findByDeployment(body.projectId, body.deploymentId, body.environment);
    const envelope = this.prepare({
      ...body,
      deploymentId: deployment?.deploymentId ?? null,
      environment: deployment?.environment ?? null,
    });
    if (deployment === undefined) {
      await this.audit.append({
        projectId: body.projectId,
        actor: 'event-ingest',
        type: 'event.unassigned',
        payload: {
          projectId: body.projectId,
          deploymentId: body.deploymentId ?? null,
          environment: body.environment ?? null,
        },
        deploymentId: body.deploymentId ?? null,
      });
    }
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
