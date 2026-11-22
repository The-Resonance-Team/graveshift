// Compile-time contract assertions for the read-only config surface. Each constant below
// has the type `true` only while its rule holds; when the generated types drift, the
// declared type becomes an object and `bun run typecheck` fails on the `= true`
// assignment. apps/api/test/config.e2e.test.ts checks the served bodies, and
// src/index.test.ts checks the committed openapi.json, so a drift also fails `bun test`.
import type {
  ConfigAgentsExportResponse,
  ConfigAgentsViewResponse,
  ConfigExportResponse,
  ConfigPolicyExportResponse,
  ConfigPolicyViewResponse,
} from './index';

type LeakedKeys<View, Forbidden extends PropertyKey> = Extract<keyof View, Forbidden>;

type AssertNoKeys<View, Forbidden extends PropertyKey> = [LeakedKeys<View, Forbidden>] extends [
  never,
]
  ? true
  : { leaked: LeakedKeys<View, Forbidden> };

type AssertHasKeys<View, Required extends PropertyKey> = Required extends keyof View
  ? true
  : { missing: Exclude<Required, keyof View> };

type ExactKeys<View, Allowed extends PropertyKey> = [keyof View] extends [Allowed]
  ? [Allowed] extends [keyof View]
    ? true
    : { extra: Exclude<keyof View, Allowed> }
  : { absent: Exclude<Allowed, keyof View> };

type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : { differ: [A, B] };

type AssertAssignable<Actual, Expected> = Actual extends Expected
  ? true
  : { notAssignable: Actual };

// The sanitized (config:read) views publish neither secret fields nor rule conditions.
const agentViewHasNoSecrets: AssertNoKeys<
  ConfigAgentsViewResponse['system'][number],
  'prompt' | 'baseUrl' | 'apiKeyEnv' | 'allowedTools'
> = true;
const agentViewKeysAreTheWhitelist: ExactKeys<
  ConfigAgentsViewResponse['system'][number],
  | 'name'
  | 'slug'
  | 'role'
  | 'description'
  | 'provider'
  | 'model'
  | 'dailyBudgetUsd'
  | 'escalateTo'
  | 'params'
> = true;
const policyViewHasNoSecrets: AssertNoKeys<ConfigPolicyViewResponse, 'approvers' | 'github'> = true;
const policyRuleHasNoCondition: AssertNoKeys<
  ConfigPolicyViewResponse['rules'][number],
  'when' | 'params'
> = true;
const policyRuleKeysAreIdentityAndDecision: ExactKeys<
  ConfigPolicyViewResponse['rules'][number],
  'id' | 'action' | 'effect'
> = true;
// A sanitized Agent publishes declared param names and never their values.
const sanitizedParamsAreNamesOnly: Same<
  ConfigAgentsViewResponse['system'][number]['params'],
  string[]
> = true;

// Counter-checks: the full (config:export) surface really keeps those fields, so the
// assertions above distinguish the two surfaces instead of a broken schema.
const exportKeepsSecretFields: AssertHasKeys<
  ConfigAgentsExportResponse['system'][number],
  'prompt' | 'baseUrl' | 'apiKeyEnv' | 'allowedTools'
> = true;
const exportKeepsParamValues: AssertAssignable<
  ConfigAgentsExportResponse['system'][number]['params'][number],
  Record<string, string>
> = true;
const exportKeepsApproverAndRepos: AssertHasKeys<
  ConfigPolicyExportResponse,
  'approvers' | 'github'
> = true;
const exportRuleKeepsCondition: AssertHasKeys<
  ConfigPolicyExportResponse['rules'][number],
  'when' | 'params'
> = true;
// The whole-config export carries every block of the validated config.
const wholeExportBlocks: ExactKeys<ConfigExportResponse, 'boot' | 'agents' | 'policy' | 'fix'> =
  true;

/** Every assertion above, each of which must be `true`. */
export const compiledAssertions = [
  agentViewHasNoSecrets,
  agentViewKeysAreTheWhitelist,
  policyViewHasNoSecrets,
  policyRuleHasNoCondition,
  policyRuleKeysAreIdentityAndDecision,
  sanitizedParamsAreNamesOnly,
  exportKeepsSecretFields,
  exportKeepsParamValues,
  exportKeepsApproverAndRepos,
  exportRuleKeepsCondition,
  wholeExportBlocks,
] as const;
