// Compile-time assertions for the one config endpoint. Each constant has the type `true`
// only while its rule holds; when the generated type drifts, the declared type becomes
// an object and `bun run typecheck` fails on the `= true` assignment. src/index.test.ts
// checks the committed document at runtime, and the API e2e tests check the served body.
import type { ConfigExportResponse } from './index';

type AssertHasKeys<View, Required extends PropertyKey> = Required extends keyof View
  ? true
  : { missing: Exclude<Required, keyof View> };

type ExactKeys<View, Allowed extends PropertyKey> = [keyof View] extends [Allowed]
  ? [Allowed] extends [keyof View]
    ? true
    : { extra: Exclude<keyof View, Allowed> }
  : { absent: Exclude<Allowed, keyof View> };

type AssertAssignable<Actual, Expected> = Actual extends Expected
  ? true
  : { notAssignable: Actual };

// The one export serves every validated block, and nothing else.
const wholeExportBlocks: ExactKeys<ConfigExportResponse, 'boot' | 'agents' | 'policy' | 'fix'> =
  true;
const bootHasHostAndPort: ExactKeys<ConfigExportResponse['boot'], 'host' | 'port'> = true;
// The export is the full config: it keeps prompt, param values and env variable names.
const exportKeepsAgentFields: AssertHasKeys<
  ConfigExportResponse['agents']['system'][number],
  'name' | 'prompt' | 'baseUrl' | 'apiKeyEnv' | 'allowedTools' | 'dailyBudgetUsd'
> = true;
const exportKeepsParamValues: AssertAssignable<
  ConfigExportResponse['agents']['system'][number]['params'][number],
  Record<string, string>
> = true;
const exportKeepsPolicyFields: AssertHasKeys<
  ConfigExportResponse['policy'],
  'approvers' | 'github' | 'rules' | 'default'
> = true;
const exportKeepsRuleCondition: AssertHasKeys<
  ConfigExportResponse['policy']['rules'][number],
  'when' | 'params' | 'effect'
> = true;
const exportKeepsFixEnvNames: AssertHasKeys<
  ConfigExportResponse['fix']['github'],
  'appIdEnv' | 'privateKeyEnv' | 'installations'
> = true;

/** Every assertion above, each of which must be `true`. */
export const compiledAssertions = [
  wholeExportBlocks,
  bootHasHostAndPort,
  exportKeepsAgentFields,
  exportKeepsParamValues,
  exportKeepsPolicyFields,
  exportKeepsRuleCondition,
  exportKeepsFixEnvNames,
] as const;
