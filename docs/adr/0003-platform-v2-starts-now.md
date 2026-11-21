# Platform v2 starts now; v1 is dead

Status: accepted
Supersedes: ADR 0001

> [ADR 0009](0009-remove-v1-daemon-and-diagnosis-model-path.md) removed the reference daemon and `packages/llm`.

Graveshift v2 starts on 2026-11-20. The Kiroween v1 scope in ADR 0001 is cancelled, not deprecated, because no package was published. PR #17 closes unmerged and the old daemon stays at `apps/_daemon` for reference only.

v2 serves one tenant per deployment. Multi-tenancy and the paid cloud option arrive in v3. `tenantId` still enters the event envelope and every stored record in v2, so the later change does not rewrite the data model.

Trade-off: we lose the 05 Dec 2026 hackathon submission and its fixed scope. We gain a clean base for a platform larger than a hackathon demo.
