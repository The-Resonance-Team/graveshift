# Actuator — Requirements

## R1 HMAC verification
- R1.1 WHEN an `ActionRequest` is received THE SYSTEM SHALL verify its HMAC signature before any action (SEC-2).

## R2 Single-use approval
- R2.1 WHEN an action is executed THE SYSTEM SHALL require an approved, unexpired, single-use approval token and reject replays (SEC-7).

## R3 Allowed actions
- R3.1 WHEN a Docker action is approved THE SYSTEM SHALL support only `restart` for allowlisted container names.
- R3.2 WHEN a K8s action is approved THE SYSTEM SHALL support rollout restart (annotation patch) and scale on allowlisted workloads using `graveshift-actuator` RBAC.

## R4 Allowlist
- R4.1 WHEN the target is not in the allowlist THE SYSTEM SHALL deny the action.

## R5 Circuit breaker
- R5.1 WHEN an incident reopens within 10 min of a Graveshift action THE SYSTEM SHALL disable auto-actions for that service and page humans (SEC-11).
