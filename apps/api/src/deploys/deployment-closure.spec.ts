import { prepareRecordedHaunting, type RecordedHaunting } from '@graveshift/core/recorded';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { dbTestEnabled, openTestDatabase, resetDatabase } from '../../test/database/fixtures';
import { AuditRepo } from '../audit/audit.repo';
import type { PrismaService } from '../infra/prisma.service';
import { DeployRepo } from './deploy.repo';
import {
  DeploymentClosure,
  openingDeploymentPair,
  type DeploymentClosureEvent,
} from './deployment-closure';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const AT = '2026-11-21T00:00:00.000Z';
const base: RecordedHaunting = prepareRecordedHaunting({
  incident: {
    id: 'haunting-1',
    service: 'api',
    state: 'open',
    signalIds: ['detection-1'],
    openedAt: AT,
    updatedAt: AT,
  },
  detections: [],
});

const view = (deploymentId: string | null, deploymentEnvironment?: string): RecordedHaunting =>
  prepareRecordedHaunting({ ...base, deploymentId, deploymentEnvironment });
const event = (deploymentId: string | null, environment: string): DeploymentClosureEvent => ({
  projectId: 'project-1',
  environment,
  view: view(deploymentId, environment),
});

describe.skipIf(!dbTestEnabled)('Deployment closure owns ADR-0027', () => {
  let db: PrismaService;
  let deploys: DeployRepo;
  let audit: AuditRepo;

  beforeAll(async () => {
    db = await openTestDatabase();
    audit = new AuditRepo(db);
    deploys = new DeployRepo(db, audit);
  });
  beforeEach(async () => {
    await resetDatabase(db);
    const org = await db.organization.create({ data: { name: 'Closure', slug: 'closure' } });
    await db.project.create({
      data: { projectId: 'project-1', orgId: org.id, name: 'Closure', slug: 'closure' },
    });
  });
  afterAll(async () => db?.onModuleDestroy());

  async function setup(): Promise<DeploymentClosure> {
    await Promise.all(
      ['production', 'staging'].map((environment) =>
        deploys.append({
          projectId: 'project-1',
          environment,
          deploymentId: SHA,
          title: 'deploy',
          dateStarted: new Date(AT),
          actor: 'daemon',
        }),
      ),
    );
    return new DeploymentClosure(deploys);
  }

  const closedEvents = () =>
    db.auditEntry.findMany({ where: { projectId: 'project-1', type: 'deployment.closed' } });

  test('the opening pair closes its Deployment and appends deployment.closed', async () => {
    const closure = await setup();
    await closure.apply(view(SHA, 'production'), event(SHA, 'production'));
    expect(await deploys.listClosed('project-1')).toEqual([
      { deploymentId: SHA, environment: 'production' },
    ]);
    expect(await closedEvents()).toHaveLength(1);
  });

  test('another Environment with the same SHA closes nothing', async () => {
    const closure = await setup();
    await closure.apply(view(SHA, 'production'), event(SHA, 'staging'));
    expect(await deploys.listClosed('project-1')).toEqual([]);
    expect(await closedEvents()).toEqual([]);
  });

  test('another SHA or a missing pair closes nothing', async () => {
    const closure = await setup();
    await closure.apply(view(SHA, 'production'), event(OTHER_SHA, 'production'));
    await closure.apply(view(null), event(null, 'production'));
    expect(await deploys.listClosed('project-1')).toEqual([]);
    expect(await closedEvents()).toEqual([]);
  });

  test('a later Event cannot move the recorded opening pair', () => {
    const recorded = view(SHA, 'production');
    expect(openingDeploymentPair(recorded, view(OTHER_SHA, 'staging'), 'staging')).toEqual({
      deploymentId: SHA,
      deploymentEnvironment: 'production',
    });
    expect(openingDeploymentPair(undefined, view(null), 'production')).toEqual({
      deploymentId: null,
      deploymentEnvironment: null,
    });
  });

  test('an unbound Event cannot pair its Environment with a later bound SHA', async () => {
    const unbound = view(null, 'production');
    const bound = view(SHA, 'staging');
    expect(openingDeploymentPair(undefined, unbound, 'production')).toEqual({
      deploymentId: null,
      deploymentEnvironment: null,
    });
    expect(openingDeploymentPair(unbound, bound, 'staging')).toEqual({
      deploymentId: SHA,
      deploymentEnvironment: 'staging',
    });
    const closure = await setup();
    await closure.apply(bound, {
      projectId: 'project-1',
      environment: 'production',
      view: unbound,
    });
    expect(await deploys.listClosed('project-1')).toEqual([]);
    expect(await closedEvents()).toEqual([]);
  });
});
