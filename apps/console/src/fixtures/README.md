# Console sample fixtures

Static, deterministic sample data for the Graveshift console design review. These fixtures do not call an API, use a database, hold credentials, authorize a caller, or change a real system.

## Use

Import a fixture directly from its module. There is no app-level barrel.

```ts
import { sampleWorkItems } from './fixtures/work-items';
import { sampleScenarios } from './fixtures/scenarios';
```

Every fixture has this wrapper shape:

```ts
{
  id: string;
  sample: true;
  origin: 'api_shaped' | 'view_model' | 'planned_demo';
  scope: { kind: 'account' | 'organization' | 'project', ...ids };
  notice: string;
  payload: T;
}
```

`payload` contains the API-shaped record when `origin` is `api_shaped`. The wrapper carries sample and scope metadata so no unsupported field is added to a backend payload. `view_model` marks derived console data. `planned_demo` marks invented UI concepts that are not backend contracts.

## Export surface

| Module | Exports |
| --- | --- |
| `sample.ts` | `SAMPLE_NOTICE`, `PLANNED_DEMO_NOTICE`, `SAMPLE_IDS`, `SAMPLE_TIMESTAMPS`, `FixtureOrigin`, `FixtureScope`, `SampleFixture<T>`, `newAccountScope`, `ownerAccountScope`, `memberAccountScope`, `passwordAccountScope`, `organizationScope`, `projectScope`, `sandboxProjectScope`, `sampleFixture` |
| `identity.ts` | `SampleAccount`, `SampleOrganization`, `SampleProject`, `sampleAccounts`, `sampleOrganizations`, `sampleProjects` |
| `deployments.ts` | `SampleDeployment`, `sampleDeployments` |
| `credentials.ts` | `SampleCredentialMetadata`, `SampleCredentialList`, `sampleCredentials`, `sampleCredentialList`, `emptyCredentialList` |
| `work-items.ts` | `SampleWorkItemList`, `sampleWorkItems`, `sampleWorkItemList`, `emptyWorkItemList` |
| `work-routing.ts` | `sampleWorkRoutings` |
| `work-results.ts` | `sampleTriageResults`, `sampleFixResults`, `SampleWorkError`, `sampleWorkErrors`, `sampleWorkCommands` |
| `overview.ts` | `SampleOverview`, `sampleOverview`, `emptyOverview` |
| `integrations.ts` | `PlannedIntegration`, `plannedIntegrations` |
| `agent.ts` | `PlannedMessage`, `PlannedActivity`, `PlannedArtifact`, `PlannedArtifactPanel`, `PlannedAgentSheet`, `PlannedAgentPage`, `plannedAgentSheet`, `plannedAgentPage`, `plannedArtifactPanel`, `emptyArtifactPanel`, `unavailableArtifactPanel` |
| `workflows.ts` | `PlannedWorkflowStep`, `PlannedWorkflow`, `PlannedWorkflowDesigner`, `plannedWorkflows`, `plannedWorkflowDesigner` |
| `scenario-model.ts` | `SCENARIO_STATES`, `SCENARIO_SURFACES`, `ScenarioState`, `ScenarioSurface`, `ScenarioInput`, `Scenario`, `defineScenario` |
| `access-scenarios.ts` | `accessScenarios` |
| `operations-scenarios.ts` | `operationsScenarios` |
| `planned-scenarios.ts` | `plannedScenarios` |
| `scenarios.ts` | `sampleScenarios` |

## Contracts and isolation

- `work-items.ts` uses `WorkItem` and `PrRef` type-only imports from `@graveshift/core`.
- Routing, result, error, and command fixtures use type-only imports from `@graveshift/work`.
- Tests import the exported Zod schemas from those workspace packages. Tests also import the current API response schemas for identity, Deployments, credentials, and Work item lists.
- Browser-reachable data modules do not import Zod or backend runtime code.
- API-shaped fixture tests assert exact field sets. This matters because some response schemas strip unknown fields instead of rejecting them.
- Work command envelopes are typed examples only. They are not executable commands or state-transition helpers.

## Planned UI concepts

Integrations, Agent Workspace conversations and activity, artifacts, and Workflows are `planned_demo` fixtures. Their test schemas are explicit and strict. They contain no diagnosis text, evidence, live Agent endpoint, permission contract, token, secret, or credential value.

The Agent sheet has no context panel. The full-screen Agent page points to the sample artifact panel. Workflow samples cover published, draft, and invalid states. None of these fixtures claims that the planned capability exists.

## Deliberate limitations

- Sign-in success uses an Account profile, not a session token.
- Registration and onboarding contain no password.
- OAuth client creation is not sampled because its response contains a one-time client secret.
- Credential fixtures contain metadata only. They contain no value, prefix, hash, or authorization result.
- Work items carry only opaque sample `diagnosisRef` identifiers required by the current schema. No Diagnosis payload or evidence is invented.
- Integration states are illustrative UI models, not current integration API responses.
- Fixture dates use fixed ISO timestamps anchored at `2026-11-27T08:00:00.000Z`. Tests need no clock, network, database, or host timezone.

## Focused checks

```sh
bun fmt apps/console/src/fixtures
bun lint --no-script --max-warnings=0 --allow-unsupported apps/console/src/fixtures
bun test apps/console/src/fixtures
```
