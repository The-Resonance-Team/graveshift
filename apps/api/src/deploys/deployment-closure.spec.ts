import { prepareRecordedHaunting, type RecordedHaunting } from '@graveshift/core/recorded';
import { describe, expect, test } from 'bun:test';

import { FakeDeployRepo } from './testing/deploy-repo.fakes';
import type { DeployRepo } from './deploy.repo';
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

async function setup() {
  const deploys = new FakeDeployRepo();
  await deploys.append({
    projectId: 'project-1',
    environment: 'production',
    deploymentId: SHA,
    title: 'deploy',
    dateStarted: new Date(AT),
    actor: 'daemon',
  });
  await deploys.append({
    projectId: 'project-1',
    environment: 'staging',
    deploymentId: SHA,
    title: 'deploy',
    dateStarted: new Date(AT),
    actor: 'daemon',
  });
  return { deploys, closure: new DeploymentClosure(deploys as unknown as DeployRepo) };
}

describe('Deployment closure owns ADR-0027', () => {
  test('the opening pair closes its Deployment and appends deployment.closed', async () => {
    const { deploys, closure } = await setup();
    await closure.apply(view(SHA, 'production'), event(SHA, 'production'));
    expect(await deploys.listClosed('project-1')).toEqual([
      { deploymentId: SHA, environment: 'production' },
    ]);
    expect(deploys.auditTypes).toContain('deployment.closed');
  });

  test('another Environment with the same SHA closes nothing', async () => {
    const { deploys, closure } = await setup();
    await closure.apply(view(SHA, 'production'), event(SHA, 'staging'));
    expect(await deploys.listClosed('project-1')).toEqual([]);
    expect(deploys.auditTypes).not.toContain('deployment.closed');
  });

  test('another SHA or a missing pair closes nothing', async () => {
    const { deploys, closure } = await setup();
    await closure.apply(view(SHA, 'production'), event(OTHER_SHA, 'production'));
    await closure.apply(view(null), event(null, 'production'));
    expect(await deploys.listClosed('project-1')).toEqual([]);
    expect(deploys.auditTypes).not.toContain('deployment.closed');
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
    const { deploys, closure } = await setup();
    await closure.apply(bound, {
      projectId: 'project-1',
      environment: 'production',
      view: unbound,
    });
    expect(await deploys.listClosed('project-1')).toEqual([]);
    expect(deploys.auditTypes).not.toContain('deployment.closed');
  });
});
