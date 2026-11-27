# Project-scoped state

Status: accepted
Superseded in part by: ADR 0023 (scope root and tenant model), ADR 0025 (Project id value and user slug)

> [ADR 0023](0023-organization-is-the-tenant-root.md) supersedes the scope part of this decision. [ADR 0025](0025-project-id-and-slug.md) refines the Project id rule. The Project definition and the deployment corrections from commit `c40d208` stay in force.

The owner replaced `tenantId` with one field named `projectId`. The old `tenantId` value is now the `projectId` value. This ADR supersedes the `tenantId` clauses in ADR 0003, ADR 0005, ADR 0012 and ADR 0017.

A Project is created by a user in the console after registering an account. Its `projectId` is numeric, so the same value names the Project in our system and in Sentry. This is one unified id, not a mapping between two ids. A value supplied by the deployment environment is only a bootstrap that binds a self-hosted host to a Project. It is not the definition of a Project and does not replace console-created Projects. Self-hosted and cloud run the same product, so console features apply in both shapes.

A Project is the scope of the platform. `projectId` is the scope on these items:

- the Event envelope;
- the NATS subject tree, `graveshift.<projectId>.<lane>.<grave>.<type>`;
- every stored row in PostgreSQL;
- every Credential;
- every audit entry;
- every API contract.

The Sentry DSN project id is the same `projectId`. It is not a second field. A source that is not Sentry uses the same `projectId` value.

`projectId` keeps the safe-subject-token rule that `tenantId` had. A value may hold letters, digits, underscore and hyphen. A dot, a wildcard and a space are refused. The current OAuth client registry still accepts any such token. That is the deployment bootstrap described above, not the console-created Project id rule. The numeric unified id takes precedence for console-created Projects; the registry validation must be aligned when console identity lands.

A Credential has one `projectId`. A plugin Credential with a `service` binding must have the numeric DSN project id as its `projectId`. `POST /api/credentials` returns 422 when the issuing OAuth client has a `projectId` that is not 1 to 20 digits. An MCP Credential has the `projectId` of the issuing OAuth client, which may be any safe subject token. The Credential no longer has a separate project id field, and the `(tenantId, projectId)` pair is removed. A Credential takes its `projectId` from the OAuth client that issues it. The create request cannot set it.

The route `POST /api/:projectId/envelope/` still requires a numeric value in the path. That is a narrower use of the same field. A Credential must have an equal `projectId`, or the route returns 403.

The owner rewrote the init migration in place. It has one `project_id` column in each table. There is no production data in v2. `docs/DECISIONS.md` records the new checksum.

The audit log stays append-only and hash-chained. Audit writes keep their serializable transaction. The chain is now keyed by `projectId`.

Recheck trigger: The owner reviews this decision when the console issues Projects, when one deployment must serve more than one console-created Project, or when the deployment-local project bootstrap is replaced by console identity.

Rejected alternative: keeping `tenantId` and adding a separate `projectId` for Sentry. Two fields for one scope would let the two values differ.

Trade-off: The rename touched every layer in one change. In return, one field names the scope everywhere, and no code maps one id to another.
