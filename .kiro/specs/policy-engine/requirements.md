# Policy Engine — Requirements

## R1 Deny by default
- R1.1 WHEN an action matches no rule THE SYSTEM SHALL return effect=deny, reason "no_matching_rule".
- R1.2 WHEN a deny rule matches the target service THE SYSTEM SHALL return deny regardless of other rules and mode.

## R2 Modes
- R2.1 WHEN mode=dry-run THE SYSTEM SHALL return dry_run instead of allow/require_approval.
- R2.2 WHEN mode=propose AND the action is a runtime action THE SYSTEM SHALL return at most require_approval.
- R2.3 WHEN GRAVESHIFT_MODE requests a less safe mode than policy.yaml THE SYSTEM SHALL ignore it and log a warning.

## R3 Limits
- R3.1 WHEN rate limits are exceeded THE SYSTEM SHALL return deny, reason "rate_limited".
- R3.2 WHEN diagnosis confidence < threshold THE SYSTEM SHALL return deny, reason "low_confidence".

## R4 Validation
- R4.1 WHEN policy.yaml is invalid THE SYSTEM SHALL refuse to start and print Zod issues with paths.

## R5 Audit
- R5.1 WHEN a decision is made THE SYSTEM SHALL append an audit event with matchedRule and reasons.
