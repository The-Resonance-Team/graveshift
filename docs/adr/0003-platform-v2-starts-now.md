# Platform v2 starts now; v1 is dead

Status: superseded in part by ADR 0023
Supersedes: ADR 0001

> [ADR 0018](0018-project-scoped-state.md) supersedes the `tenantId` clause here. `projectId` replaces it.
>
> [ADR 0023](0023-organization-is-the-tenant-root.md) supersedes the one-tenant scope claim below. The history in this ADR stays as a record of the v2 decision.
>
> [ADR 0009](0009-remove-v1-daemon-and-diagnosis-model-path.md) removed the reference daemon and `packages/llm`.

Graveshift v2 starts on 2026-11-20. The Kiroween v1 scope in ADR 0001 is cancelled, not deprecated, because no package was published. PR #17 closes unmerged and the old daemon stays at `apps/_daemon` for reference only.

In v2 the owner stated that one deployment served one tenant, and that a multi-tenant model and a paid cloud option would arrive later. `tenantId` still entered the event envelope and every stored record in v2, so the later change did not rewrite the data model. [ADR 0023](0023-organization-is-the-tenant-root.md) now sets the scope model: one deployment serves many Organizations, and each Organization owns its Projects directly.

Trade-off: we lose the 05 Dec 2026 hackathon submission and its fixed scope. We gain a clean base for a platform larger than a hackathon demo.
