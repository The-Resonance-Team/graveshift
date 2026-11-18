# Policy Engine — Design

## Interfaces
- `loadPolicy(path): Policy` — parse YAML, validate with a Zod schema, return the typed policy or throw with issue paths.
- `decide(policy, context, action): PolicyDecision` — pure, deterministic function returning `{ effect, reason, matchedRule, mode }`.
- `PolicyDecision.effect` ∈ `allow | deny | require_approval | dry_run`.
- `Context` carries service, mode override (`GRAVESHIFT_MODE`), confidence, and current rate counters.

## Mode lattice (safe → unsafe)
`dry-run < propose < act`. The effective mode is the SAFER of the policy mode and the env override.
An override can never raise the mode above `policy.yaml` (R2.3).

## Data flow
1. Load and validate policy at startup (fail fast on invalid YAML, R4.1).
2. Evaluate deny rules first, then allow rules; default deny (R1).
3. Clamp the result through the mode lattice (R2).
4. Apply rate-limit and confidence gates (R3).
5. Emit an audit event with `matchedRule` and `reasons` (R5).

## Error handling
- Invalid policy → refuse to start, print all Zod issues with JSON paths.
- Missing rule → deny with `no_matching_rule` (never an exception).

## Testing
`fast-check` properties (§14.2): no-match implies deny; deny on target implies deny in every mode;
dry-run never yields allow/require_approval; env override never raises the mode; propose never
returns allow for a runtime action. Unit tests for Zod issue paths and audit payload shape.
