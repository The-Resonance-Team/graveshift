import { PLANNED_DEMO_NOTICE, SAMPLE_NOTICE, sampleFixture } from './sample';

type FixtureOrigin = ReturnType<typeof sampleFixture>['origin'];
type FixtureScope = ReturnType<typeof sampleFixture>['scope'];

export const SCENARIO_STATES = [
  'success',
  'empty',
  'loading',
  'access_denied',
  'validation',
  'conflict',
  'retry',
  'human_intervention',
  'failure',
] as const;

export const SCENARIO_SURFACES = [
  'sign_in',
  'registration',
  'onboarding',
  'overview',
  'work_items',
  'work_item_detail',
  'deployments',
  'integrations',
  'credentials',
  'account_settings',
  'organization_settings',
  'project_settings',
  'agent_sheet',
  'agent_page',
  'artifacts',
  'workflows',
  'workflow_designer',
] as const;

export type ScenarioState = (typeof SCENARIO_STATES)[number];
export type ScenarioSurface = (typeof SCENARIO_SURFACES)[number];

export interface ScenarioInput {
  id: string;
  surface: ScenarioSurface;
  state: ScenarioState;
  origin: FixtureOrigin;
  scope: FixtureScope;
  title: string;
  summary: string;
  fixtureIds: readonly string[];
}

export interface Scenario extends ScenarioInput {
  readonly sample: true;
  readonly notice: string;
}

export function defineScenario(input: ScenarioInput): Scenario {
  return {
    ...input,
    sample: true,
    notice: input.origin === 'planned_demo' ? PLANNED_DEMO_NOTICE : SAMPLE_NOTICE,
  };
}
