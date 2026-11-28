import { describe, expect, test } from 'bun:test';

import {
  emptyArtifactPanel,
  plannedAgentPage,
  plannedAgentSheet,
  plannedArtifactPanel,
  unavailableArtifactPanel,
} from './agent';
import { emptyCredentialList, sampleCredentialList, sampleCredentials } from './credentials';
import { sampleDeployments } from './deployments';
import { sampleAccounts, sampleOrganizations, sampleProjects } from './identity';
import { plannedIntegrations } from './integrations';
import { emptyOverview, sampleOverview } from './overview';
import { PLANNED_DEMO_NOTICE, SAMPLE_NOTICE, SAMPLE_TIMESTAMPS } from './sample';
import { SCENARIO_STATES, SCENARIO_SURFACES } from './scenario-model';
import { sampleScenarios } from './scenarios';
import { emptyWorkItemList, sampleWorkItemList, sampleWorkItems } from './work-items';
import { sampleWorkRoutings } from './work-routing';
import {
  sampleFixResults,
  sampleTriageResults,
  sampleWorkCommands,
  sampleWorkErrors,
} from './work-results';
import { plannedWorkflowDesigner, plannedWorkflows } from './workflows';

const fixtures = [
  ...sampleAccounts,
  ...sampleOrganizations,
  ...sampleProjects,
  ...sampleDeployments,
  ...sampleCredentials,
  sampleCredentialList,
  emptyCredentialList,
  ...sampleWorkItems,
  sampleWorkItemList,
  emptyWorkItemList,
  ...sampleWorkRoutings,
  ...sampleTriageResults,
  ...sampleFixResults,
  ...sampleWorkErrors,
  ...sampleWorkCommands,
  sampleOverview,
  emptyOverview,
  ...plannedIntegrations,
  plannedAgentSheet,
  plannedAgentPage,
  plannedArtifactPanel,
  emptyArtifactPanel,
  unavailableArtifactPanel,
  ...plannedWorkflows,
  plannedWorkflowDesigner,
] as const;

function scopesCompatible(
  scenarioScope: (typeof fixtures)[number]['scope'],
  fixtureScope: (typeof fixtures)[number]['scope'],
): boolean {
  if (scenarioScope.kind === 'account') {
    return scenarioScope.accountId === fixtureScope.accountId;
  }
  if (scenarioScope.kind === 'organization') {
    return (
      scenarioScope.accountId === fixtureScope.accountId &&
      fixtureScope.kind !== 'account' &&
      scenarioScope.orgId === fixtureScope.orgId
    );
  }
  return (
    fixtureScope.kind === 'project' &&
    scenarioScope.accountId === fixtureScope.accountId &&
    scenarioScope.orgId === fixtureScope.orgId &&
    scenarioScope.projectId === fixtureScope.projectId
  );
}

describe('fixture registry', () => {
  test('every fixture is unique, explicitly sample, and uses a known scope', () => {
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(fixtures.length);
    const accountIds = new Set(sampleAccounts.map((account) => account.payload.id));
    const orgIds = new Set(sampleOrganizations.map((organization) => organization.payload.id));
    const projectIds = new Set(sampleProjects.map((project) => project.payload.projectId));
    for (const fixture of fixtures) {
      expect(fixture.sample).toBe(true);
      expect(fixture.notice).toBe(
        fixture.origin === 'planned_demo' ? PLANNED_DEMO_NOTICE : SAMPLE_NOTICE,
      );
      expect(accountIds.has(fixture.scope.accountId)).toBe(true);
      if (fixture.scope.kind !== 'account') expect(orgIds.has(fixture.scope.orgId)).toBe(true);
      if (fixture.scope.kind === 'project')
        expect(projectIds.has(fixture.scope.projectId)).toBe(true);
    }
  });

  test('Overview counts agree with the source fixture collections', () => {
    expect(sampleOverview.payload.workItems.total).toBe(sampleWorkItems.length);
    expect(sampleOverview.payload.workItems.open).toBe(
      sampleWorkItems.filter((item) => item.payload.status !== 'done').length,
    );
    expect(sampleOverview.payload.workItems.done).toBe(
      sampleWorkItems.filter((item) => item.payload.status === 'done').length,
    );
    expect(sampleOverview.payload.deployments.total).toBe(
      sampleDeployments.filter(
        (deployment) => deployment.payload.projectId === sampleOverview.payload.projectId,
      ).length,
    );
    expect(sampleOverview.payload.deployments.active).toBe(
      sampleDeployments.filter(
        (deployment) =>
          deployment.payload.projectId === sampleOverview.payload.projectId &&
          deployment.payload.dateFinished === null,
      ).length,
    );
    expect(sampleOverview.payload.credentials.total).toBe(sampleCredentials.length);
    expect(sampleOverview.payload.credentials.active).toBe(
      sampleCredentials.filter(
        (credential) =>
          credential.payload.revokedAt === null &&
          (credential.payload.expiresAt === null ||
            credential.payload.expiresAt > SAMPLE_TIMESTAMPS.anchor),
      ).length,
    );
    expect(emptyOverview.payload.workItems.total).toBe(0);
    expect(emptyOverview.payload.deployments.total).toBe(0);
    expect(emptyOverview.payload.credentials.total).toBe(0);
  });
});

describe('scenario catalog', () => {
  test('scenarios are unique, explicitly sample, and reference existing fixtures', () => {
    expect(new Set(sampleScenarios.map((scenario) => scenario.id)).size).toBe(
      sampleScenarios.length,
    );
    const fixtureIds = new Set(fixtures.map((fixture) => fixture.id));
    for (const scenario of sampleScenarios) {
      expect(scenario.sample).toBe(true);
      expect(scenario.notice).toBe(
        scenario.origin === 'planned_demo' ? PLANNED_DEMO_NOTICE : SAMPLE_NOTICE,
      );
      for (const fixtureId of scenario.fixtureIds) {
        const fixture = fixtures.find((candidate) => candidate.id === fixtureId);
        if (fixture === undefined) throw new Error(`Missing scenario fixture: ${fixtureId}`);
        expect(fixture.origin).toBe(scenario.origin);
        expect(scopesCompatible(scenario.scope, fixture.scope)).toBe(true);
        expect(fixtureIds.has(fixtureId)).toBe(true);
      }
    }
  });

  test('the catalog covers every required state and surface', () => {
    expect(new Set(sampleScenarios.map((scenario) => scenario.state))).toEqual(
      new Set(SCENARIO_STATES),
    );
    expect(new Set(sampleScenarios.map((scenario) => scenario.surface))).toEqual(
      new Set(SCENARIO_SURFACES),
    );
  });

  test('planned surfaces never reference API-shaped fixtures', () => {
    const plannedSurfaces = new Set([
      'integrations',
      'agent_sheet',
      'agent_page',
      'artifacts',
      'workflows',
      'workflow_designer',
    ]);
    for (const scenario of sampleScenarios) {
      if (plannedSurfaces.has(scenario.surface)) expect(scenario.origin).toBe('planned_demo');
      else expect(scenario.origin).not.toBe('planned_demo');
    }
  });
});
