# Numeric Project id and user slug

Status: accepted
Supersedes: the Project id value rule in ADR 0018

On 2026-11-22 the owner decided how Graveshift names a Project. Graveshift assigns a bigint Project id and stores it as a decimal string. The user sets a slug. Our own DSN carries the numeric id.

The slug is a label for people. It is not a second id. It is not a mapping to Sentry. One numeric id names the Project in Graveshift and in our DSN, so no code maps a slug to an id or to a Sentry value. [ADR 0018](0018-project-scoped-state.md) still owns `projectId` as the scope on events and stored records; this decision refines its value and adds the user slug.

The implementation will assign the id when the user creates the Project. The user will be able to change the slug as a label without changing the id.

Trade-off: the label can change while the id stays fixed. In return, the DSN, events and stored records share one stable numeric value.
