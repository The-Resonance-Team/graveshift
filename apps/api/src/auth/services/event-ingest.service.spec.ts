import { describe, expect, mock, test } from 'bun:test';

import { validEnvelope } from '../../../test/fakes/auth-test-helpers';
import { AuditRepo } from '../../audit/repo/audit.repo';
import { DeployRepo } from '../../deploys/deploy.repo';
import type { VerifiedCredential } from '../auth.types';
import type { PublishEventDto } from '../dto/publish-event.dto';
import { EVENTS_PUBLISH_SCOPE } from '../scopes';
import { EventIngestService } from './event-ingest.service';

const SHA = 'a'.repeat(40);
const principal: VerifiedCredential = {
  id: 'cred-1',
  kind: 'plugin',
  clientId: 'client-1',
  projectId: '12345',
  scopes: [EVENTS_PUBLISH_SCOPE],
  service: null,
  expiresAt: null,
};

function setup() {
  const published: Array<{ deploymentId?: string | null; environment?: string | null }> = [];
  const publisher = {
    publish: async (envelope: { deploymentId?: string | null; environment?: string | null }) => {
      published.push(envelope);
    },
  };
  const findByDeployment = mock<DeployRepo['findByDeployment']>(async () => undefined);
  const appended: Array<{ type: string; projectId: string; payload: unknown }> = [];
  const audit = {
    append: async (input: { type: string; projectId: string; payload: unknown }) => {
      appended.push(input);
      return { seq: appended.length };
    },
  };
  const service = new EventIngestService(
    publisher as never,
    { findByDeployment } as unknown as DeployRepo,
    audit as unknown as AuditRepo,
  );
  return { service, published, findByDeployment, appended };
}

const body = (overrides: Record<string, unknown> = {}) =>
  validEnvelope({
    id: 'evt-binding',
    deploymentId: SHA,
    environment: 'production',
    ...overrides,
  }) as PublishEventDto;

describe('EventIngestService deployment binding', () => {
  test('stamps a resolved Deployment onto the published envelope', async () => {
    const { service, published, findByDeployment, appended } = setup();
    findByDeployment.mockResolvedValue({
      orgId: 'org-1',
      projectId: '12345',
      deploymentId: SHA,
      environment: 'production',
      title: 'deploy-1',
      dateStarted: '2026-11-22T07:00:00.000Z',
      dateFinished: null,
      url: null,
      closedAt: null,
      createdAt: '2026-11-22T07:00:00.000Z',
    });
    const result = await service.ingest(body(), principal);
    expect(result).toEqual({ accepted: true, id: 'evt-binding' });
    expect(findByDeployment).toHaveBeenCalledWith('12345', SHA, 'production');
    expect(published[0]?.deploymentId).toBe(SHA);
    expect(published[0]?.environment).toBe('production');
    expect(appended).toEqual([]);
  });

  test('an unknown SHA or Environment nulls both fields and writes one audit entry', async () => {
    const { service, published, appended } = setup();
    await service.ingest(body({ deploymentId: 'b'.repeat(40) }), principal);
    await service.ingest(body({ environment: 'sandbox' }), principal);
    await service.ingest(body({ deploymentId: undefined, environment: undefined }), principal);
    expect(published).toHaveLength(3);
    for (const envelope of published) {
      expect(envelope.deploymentId).toBeNull();
      expect(envelope.environment).toBeNull();
    }
    expect(appended.map((entry) => entry.type)).toEqual([
      'event.unassigned',
      'event.unassigned',
      'event.unassigned',
    ]);
    expect(appended[0]).toMatchObject({ projectId: '12345', payload: { projectId: '12345' } });
  });

  test('a client cannot borrow another Project Deployment', async () => {
    const { service, published, findByDeployment } = setup();
    await service.ingest(body(), principal);
    expect(findByDeployment).toHaveBeenCalledTimes(1);
    expect(findByDeployment.mock.calls[0]?.[0]).toBe(principal.projectId);
    expect(published[0]?.deploymentId).toBeNull();
  });
});
