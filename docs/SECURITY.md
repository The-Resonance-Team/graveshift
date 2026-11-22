# Security

Graveshift is read-only toward production by default. These rules match `.kiro/steering/safety.md`. The statements below describe the code as built; where a control is not built it says so.

## Guardrails

1. **Only the actuator changes runtime state.** `packages/actuator` runs an `ActionRequest` only if the HMAC-SHA256 signature is valid, the token is unexpired (15 minutes, `TOKEN_TTL_MS`), the token has not been used before, the service is allowed, and `decide()` does not deny. Runtime actions are always `require_approval` in policy, even in `act` mode. The actuator refuses to start without `ACTUATOR_HMAC_SECRET` of 32 or more characters.
2. **PR only.** `packages/fixer` pushes only to the policy branch prefix (default `graveshift/`) and opens pull requests with `draft: true`. It has no merge call. The patch guard rejects absolute paths, `..`, backslashes, forbidden paths and over-size patches before any GitHub call.
3. **Deterministic policy.** `decide()` is pure. It evaluates deny rules first, then the first matching rule, with default deny. Confidence, rate and budget limits can only turn an allow into a deny. A model cannot grant a permission. `GRAVESHIFT_MODE` can move the mode toward a safer value only (`act` to `propose` to `dry-run`).
4. **Redaction.** `packages/redactor` runs before LLM calls, logs, audit payloads and every MCP response string. Detectors cover private keys, JWTs, URL passwords, AWS keys, GitHub and Discord tokens, bearer and basic auth, environment-style secrets, emails, Vietnamese phone numbers and high-entropy strings. Discord messages are not built yet, so that path is untested.
5. **Untrusted content.** Logs and file contents are wrapped in `<untrusted_*>` tags before reaching a model or an MCP client.
6. **No Docker socket, no cluster-admin.** The daemon reaches Docker only through the read-only socket proxy. `docker.sock` is mounted only into the two proxies. The Kubernetes source uses the in-cluster ServiceAccount.
7. **No secrets in the repository.** `.env*` is gitignored. Example files hold placeholders. `scripts/kiro/secret-scan.mjs` runs on save through a Kiro hook.
8. **Circuit breaker.** If a haunting reopens within 10 minutes of an action, auto-actions for that service stop. The helper is in `packages/core` and the actuator applies it. **Paging humans needs Discord and is not built.**
9. **Agent model calls.** `packages/gateway` is the single model path, including diagnosis. `apiKeyEnv` names an environment variable. Do not store keys in YAML. The adapter rejects an unset or placeholder key. The gateway redacts model inputs, applies per-Agent and global UTC daily budgets, requires evidence validation and an audit callback on every task. Transport retry follows the gateway config. Validation gets one retry with a redacted reason if budget remains. Diagnosis checks evidence refs and supplies a rules-only fallback. Policy is the authority for permissions. ADR 0009 removed the reference daemon and `packages/llm`.

## Audit chain

`apps/api/src/audit` keeps audit entries in PostgreSQL, keyed by `tenant_id` and `seq`, with `at` (UTC), `actor`, `type`, `incident_id`, `payload`, `prev_hash` and `hash`.

- `hash` is SHA-256 over a canonical, key-sorted encoding of `[seq, at, actor, type, incidentId or null, payload, prevHash]`. The first `prevHash` is 64 zeros.
- Enforcement point: the database. The migration `20261121052714_init` creates the function `prevent_audit_entry_mutation()` and two row triggers on `audit_entries`: `audit_entries_no_update` (BEFORE UPDATE) and `audit_entries_no_delete` (BEFORE DELETE). Each trigger raises `audit entries are append-only`, so a direct SQL `UPDATE` or `DELETE` fails. Application code is not the only guard. Prisma does not manage these triggers; the migration SQL holds them in a marked block.
- `AuditRepo.append` runs in a serializable transaction. It takes a per-tenant advisory lock, reads the last entry, and writes `seq + 1` with the previous hash. A serialization conflict (`P2034`) is tried up to 20 times (19 retries). Services inject `AuditRepo` and never the Prisma client. `payload` is a Prisma `Json` field (PostgreSQL `JSONB`). The core helpers `makeAuditEntry`, `verifyEntries` and `GENESIS_HASH` from `@graveshift/core` are the only chain logic.
- The SQLite audit store (`packages/store`, Drizzle, `bun:sqlite`) is removed. No fallback store exists.
- Limit: a database owner can drop the triggers and then change rows. `verifyChain()` detects edits, removal inside the chain and reordering. It does not detect deleted newest entries without publishing the head hash somewhere else.
- `verifyChain()` walks all entries and returns the first broken `seq` with a reason (`sequence gap or reorder`, `prevHash mismatch` or `hash mismatch`). Tests cover edits to any field, removal and reordering, and a payload with a `__proto__` key.
- Credential creation, revocation and first observed expiry write an audit entry in the same PostgreSQL transaction as the credential change.

## MCP server

Every tool input has a Zod schema with limits (`list_incidents` at most 50, `get_audit_log` at most 100, `tail_logs` at most 200 lines). `query_metric` accepts only allowlisted metric and function names and range selectors of at most 60 minutes. `propose_fix` returns a policy decision and never executes; its reply says that rate and budget limits are not enforced because the daemon exposes no counters. The HTTP route calls the shared credential component and accepts only an unexpired, unrevoked MCP token with kind `mcp`. The component compares hashes in constant time. The `/mcp` bearer path is tested in-process only (HTTP e2e against the Nest application), not over a real network. The stdio launcher has no authentication by design: it trusts the local process and must only be started by a local user. It still builds the same `AppModule`, so `GRAVESHIFT_OAUTH_JWT_SECRET` must be set at boot even for stdio; `powers/graveshift/mcp.json` holds a placeholder that a local user replaces.

The MCP audit tools are stubs in v2. `get_audit_log` returns an empty list, and `verify_audit_chain` returns `{ ok: false, unavailable: true }`, because the v2 daemon exposes no audit read API. These tools do not read the PostgreSQL audit chain that this service writes. Tickets #47 and #60 own the real implementations.

## Credentials and event ingest

`apps/api/src/auth` is the only issuer and verifier for MCP tokens and event keys. Credential management uses OAuth 2.1 client credentials: a passport strategy checks a bearer JWT signed with `@nestjs/jwt`. `POST /api/oauth/token` signs a JWT with `iss`, `aud`, `sub`, `scope`, `jti` and `exp` from a boot client registry. The secret has no default; boot fails in every environment when it is unset. A passport strategy requires `iss`, `aud` and `exp` and checks the tenant against the registry. Throttling covers token, credential, event and MCP routes and keys by client id resolved from the bearer token. After a restart the in-memory key index is empty, so the first request from an issued key falls into the caller's IP bucket and later requests use the client-id bucket. A client holds at most ten active credentials, and the cap check runs in the same serialized section as issue. Every MCP HTTP method is scope-checked with deny by default; the route returns 403 for a method outside token scopes. A failed NATS connect clears the cached promise, so a later publish retries and fails closed with 503. Request DTOs use `class-validator`, whitelist, `forbidNonWhitelisted`, transform and 422, so an unknown field fails at the pipe.

PostgreSQL stores a SHA-256 hash, a short display prefix, kind, name, client id, tenant id, scopes, optional service and project id bindings, and timestamps. It never stores the credential value. All values are 32 random bytes encoded as 64 lowercase hex characters. The value appears once in the create response and is never logged. Presented values are hashed and compared in constant time. Credentials issued before this change use base64url values and must be reissued. Expired, revoked, unknown or wrong-kind values deny the call. Issue and revoke serialize on a tenant-and-client advisory lock; the ten-active-credential limit is checked in the same transaction as issue.

`tokens:manage` is required to manage credentials. The scope catalog is fixed. MCP kinds may carry the six read scopes; event keys may carry `events:publish`. A Sentry key also has a numeric `projectId` and a bound Grave in `service`. It is public by design, so it can only publish events and it is rate-limited. A client cannot grant `admin` or `tokens:manage`, and cannot grant a scope its own token does not hold. `GET /api/credentials` returns metadata only: no value and no hash.

`POST /api/events` checks `events:publish`, the tenant binding and the optional service binding. A native event key without a binding may publish for any service in its tenant. The interceptor bounds the parsed body before validation, and the request rate uses the in-process throttler. The HTTP platform parses JSON with a 100 KB default limit, so `GRAVESHIFT_EVENT_MAX_BYTES` is capped at 102400 bytes; a larger body is refused by Express before the interceptor runs. `EventEnvelopeSchema` from `packages/core` checks the canonical shape, and every string passes through `packages/redactor` before publish. Client apps use the HTTP publisher with a bearer event key and hold no NATS credential.

## Sentry DSN ingest

Create an event Credential with `events:publish` as its only scope, a Grave in `service`, and a numeric string in `projectId`. Configure an official Sentry SDK with `https://<public-key>@<api-host>/<projectId>`. The SDK sends the envelope to `/api/<projectId>/envelope/`. The project id is a path value only; it does not name the Grave. The verified Credential's `service` binding selects the Grave and its `tenantId` selects the tenant. The handler checks that the path project id equals the Credential's `projectId`. It does not use event fields for identity or authentication.

The API accepts the key in the SDK's `sentry_key` query parameter, an envelope `dsn` header, or `Authorization: Sentry <key>`. The shared Credential verifier compares hashes in constant time. If more than one key form is present, all values must match. A missing, unknown or mismatched key, project id or binding returns 403. The handler never echoes a key. The request rate is bounded. A 429 response includes `Retry-After` so the SDK can pause sending. Real Sentry SDKs are served by the `sentry_key` query parameter and the envelope `dsn`; `X-Sentry-Auth` is not the SDK path.

The adapter accepts `event` items and skips `session`, `client_report`, `attachment`, `transaction`, `span`, `profile`, replay and metric items. It skips other non-event item types too. The full envelope and each event item are limited to 1 MiB. The adapter maps one event to one `EventEnvelope`, redacts exception, message and request data, validates with `EventEnvelopeSchema`, then publishes through the same injected `Publisher` as `/api/events`.

| Sentry value | Event field | Severity |
| --- | --- | --- |
| Credential tenant binding | `tenantId` | — |
| Credential service binding | `service` (Grave) | — |
| Envelope `event_id`, then event `event_id` | `id` | — |
| `sentry` | `source` | — |
| Exception type, or `event` | `type` (`sentry.<type>`) | — |
| `fatal`, `error` | `severity` | `critical` |
| `warning` | `severity` | `warning` |
| `info`, `debug`, other | `severity` | `info` |
| `timestamp`, else envelope `sent_at`, else ingestion time | `observedAt` | — |
| Trace id, then event id | `traceId` | — |
| Sentry fingerprint, else type + culprit + message | `fingerprint` | — |
| Exception, message and request | Redacted `payload` | — |

The CI e2e suite uses a fake publisher and fake Credential verifier. It makes no socket call. To test an official SDK locally, run `env -u CI bun test --tsconfig-override apps/api/tsconfig.json apps/api/test/sentry-sdk.loopback.e2e.test.ts`. The test starts Nest on loopback and sends one SDK event. It uses no Sentry account, NATS endpoint or production Credential.

## Known gaps

- The v2 daemon serves only `/healthz` on localhost. The `/mcp` bearer path is checked in-process only, and stdio is unauthenticated by design.
- Consumed actuator token IDs are in memory; a restart inside the 15-minute window forgets them.
- The Kubernetes network policy allows all egress. Egress allowlisting is not done.
- The `pods/log` rule exposes log contents to the daemon. For real users, use a namespace-scoped Role instead of the ClusterRole.
- Agent config requires an HTTPS `baseUrl` without URL credentials. The budget check and charge are separate steps. Concurrent calls can spend more than the daily limit.
- Kubernetes code is tested with fixtures only.
- Expiry audit is written the first time an expired credential is presented; an idle credential does not create an expiry event until a request observes it.
- `GRAVESHIFT_OAUTH_JWT_SECRET` has no default. Set it to a secret of at least 32 characters before boot.
- Without `GRAVESHIFT_NATS_URL`, publish calls fail closed with 503. The API does not buffer envelopes on disk.
