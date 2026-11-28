import { accessScenarios } from './access-scenarios';
import { operationsScenarios } from './operations-scenarios';
import { plannedScenarios } from './planned-scenarios';
import type { Scenario } from './scenario-model';

export const sampleScenarios: readonly Scenario[] = [
  ...accessScenarios,
  ...operationsScenarios,
  ...plannedScenarios,
];
