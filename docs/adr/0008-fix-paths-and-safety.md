# Auto-fix and Fix now keep the same safety path

Status: accepted

Graveshift can fix a Work item automatically when the `fix.enabled` flag in the boot config is true. The flag is read from the one committed config file at boot; it is not a per-client permission.

An Agent assignment has one fix trigger. When the Agent trigger is enabled, the fix starts from triage and "Fix now" is rejected. When the trigger is disabled, "Fix now" is the manual trigger and waits for the attempt outcome. A Human assignment means that a person fixes the Work item manually. Neither auto-fix nor "Fix now" runs for a Human assignment. [ADR 0021](0021-work-item-routing-and-assignment.md) owns this rule; [ADR 0015](0015-one-config-file-at-boot.md) owns the boot flag.

Both cases call `decide()`. A policy `allow` is required. The model proposes the patch; the policy grants permission. The result is a draft pull request only. No merge and no runtime action follow from a fix.

Trade-off: "Fix now" still waits on policy, so a deny cannot be bypassed by clicking the button. Assignment determines who fixes the Work item; client config determines whether an Agent assignment starts automatically.
