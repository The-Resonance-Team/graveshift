# Auto-fix and Fix now keep the same safety path

Status: accepted

Graveshift can fix a work item automatically when the `fix.enabled` flag in the boot config is true, or on a "Fix now" action. The flag is read from the one committed config file at boot; it is not a per-client permission. "Fix now" has two cases: it moves the work item to the front of the fix queue, and it is the manual trigger when auto-fix is off.

An Agent assignment can start a fix automatically when client config enables that trigger. When the client disables auto-fix for that trigger, a person can use "Fix now". A Human assignment means that a person fixes the Work item manually. Neither auto-fix nor "Fix now" runs for a Human assignment. [ADR 0021](0021-work-item-routing-and-assignment.md) records this clarification from 2026-11-21.

Both cases call `decide()`. A policy `allow` is required. The model proposes the patch; the policy grants permission. The result is a draft pull request only. No merge and no runtime action follow from a fix.

Trade-off: "Fix now" still waits on policy, so a deny cannot be bypassed by clicking the button. Assignment determines who fixes the Work item; client config determines whether an Agent assignment starts automatically.
