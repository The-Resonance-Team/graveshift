# Project-scoped state

Status: accepted

The owner replaced `tenantId` with one field named `projectId`. The old `tenantId` value is now the `projectId` value. This ADR supersedes the `tenantId` clauses in ADR 0003, ADR 0005, ADR 0012 and ADR 0017.

A Project is the scope of the platform. `projectId` is the scope on these items:

- the Event envelope;
- the NATS subject tree, `graveshift.<projectId>.<lane>.<grave>.<type>`;
- every stored row in PostgreSQL;
- every Credential;
- every audit entry;
- every API contract.

The Sentry DSN project id is the same `projectId`. It is not a second field. A source that is not Sentry uses the same `projectId` value.

`projectId` keeps the safe-subject-token rule that `tenantId` had. A value may hold letters, digits, underscore and hyphen. A dot, a wildcard and a space are refused.

A Credential has one `projectId`. A plugin Credential with a `service` binding must have the numeric DSN project id as its `projectId`. `POST /api/credentials` returns 422 when the issuing OAuth client has a `projectId` that is not 1 to 20 digits. An MCP Credential has the `projectId` of the issuing OAuth client, which may be any safe subject token. The Credential no longer has a separate project id field, and the `(tenantId, projectId)` pair is removed. A Credential takes its `projectId` from the OAuth client that issues it. The create request cannot set it.

The route `POST /api/:projectId/envelope/` still requires a numeric value in the path. That is a narrower use of the same field. A Credential must have an equal `projectId`, or the route returns 403.

The owner rewrote the init migration in place. It has one `project_id` column in each table. There is no production data in v2. `docs/DECISIONS.md` records the new checksum.

The audit log stays append-only and hash-chained. Audit writes keep their serializable transaction. The chain is now keyed by `projectId`.

Recheck trigger: The owner reviews this decision when v3 adds more than one project in one deployment.

Rejected alternative: keeping `tenantId` and adding a separate `projectId` for Sentry. Two fields for one scope would let the two values differ.

Trade-off: The rename touched every layer in one change. In return, one field names the scope everywhere, and no code maps one id to another.
