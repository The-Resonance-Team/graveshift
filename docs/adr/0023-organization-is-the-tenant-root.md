# Organization is the tenant root

Status: accepted
Supersedes: the scope part of ADR 0018 and the one-tenant claim in ADR 0003

On 2026-11-22 the owner decided that Organization is the root of identity and scope in Graveshift. One deployment serves many Organizations. An Organization owns Projects directly. No layer sits between an Organization and its Projects.

The scope part of [ADR 0018](0018-project-scoped-state.md) moves to this decision. ADR 0018 still owns `projectId` as the scope on the Event envelope, the event subject, stored rows, Credentials, audit entries and API contracts. The implementation will carry the owning Organization on that scope and will take identity from the authenticated request, not from one host-level value. The one-tenant claim in [ADR 0003](0003-platform-v2-starts-now.md) is history and no longer states the product model.

Graveshift deviates from Sentry on one point. Sentry places a Team layer between an Organization and its Projects. Graveshift has no Team layer. This is deliberate. It holds in v3 and it still holds in v4. The owner chose the direct bond because access has one owner and one path from an Account to a Project. A second grouping would add a second place to grant and check access. The implementation will not add a Team model or a Team route.

Upgrade trigger: the owner will add a Team only when a Project needs access shared by a subset of the Organization's members. Until that need exists, no Team is planned.

Trade-off: less grouping power than Sentry. In return, access has one owner and one path.
