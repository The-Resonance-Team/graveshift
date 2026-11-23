# Work item assignment controls the fix trigger

Status: accepted

On 2026-11-21 the owner chose Work item processing as the first production host for the Routing agent. An Agent assignment selects the configured Agent that handles the fix. A Human assignment means a person performs the fix manually; Graveshift runs no fix and rejects "Fix now" for that assignment. Client config controls auto-fix for each Agent assignment trigger. An enabled trigger starts automatically. A disabled trigger waits for "Fix now". This amends the older two-case wording in ADR 0008.

The Routing agent fills params for the assigned Agent. Missing params cause one saved question. A complete answer resumes the same Fix attempt. An incomplete answer after that question hands the Work item to a person. Question progress survives a restart. All model calls use the shared gateway. Both fix triggers still require policy `allow` and end only in an Exorcism.

"Fix now" continues to wait for the attempt outcome and uses the existing completed-result HTTP shape. Admission and ordering happen before execution. No accepted-job response replaces the existing contract. New assignment eligibility and routing outcomes must be documented in the generated contract.

The owner clarified the eligibility rule on 2026-11-22 after review: "Fix now" is the manual trigger only for a disabled Agent trigger. An enabled trigger already starts automatically, so "Fix now" is rejected there. This resolves the earlier reading that allowed "Fix now" for an enabled trigger without changing the older HTTP response shape. The rule is enforced in `packages/work/src/decisions.ts` by `assertFixEligible`.

The trade-off is durable routing progress and stricter assignment eligibility. In return, a Human assignment cannot silently launch an Agent fix, and the client can disable an automatic trigger without losing the explicit "Fix now" action.
