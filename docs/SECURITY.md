# Security

The external API, daemon and privileged actuator have separate owners. Fixes end at draft pull requests. Model output never grants permission. [ADR 0008, ADRs 0014–0018 and ADRs 0019–0022](adr/) state the execution and privacy rules.

## Authentication and private access

1. **Only the actuator changes runtime state.** `packages/actuator` runs an `ActionRequest` only if the HMAC-SHA256 signature is valid, the token is unexpired (15 minutes, `TOKEN_TTL_MS`), the token has not been used before, the service is allowed, and `decide()` does not deny. Runtime actions are always `require_approval` in policy, even in `act` mode. The actuator refuses to start without `ACTUATOR_HMAC_SECRET` of 32 or more characters.
2. **PR only.** `packages/fixer` pushes only to the policy branch prefix (default `graveshift/`) and opens pull requests with `draft: true`. It has no merge call. The patch guard rejects absolute paths, `..`, backslashes, forbidden paths and over-size patches before any GitHub call.
3. **Deterministic policy.** `decide()` is pure. It evaluates deny rules first, then the first matching rule, with default deny. Confidence, rate and budget limits can only turn an allow into a deny. A model cannot grant a permission. `GRAVESHIFT_MODE` can move the mode toward a safer value only (`act` to `propose` to `dry-run`).
4. **Redaction.** `packages/redactor` runs before LLM calls, logs, audit payloads and every MCP response string. Detectors cover private keys, JWTs, URL passwords, AWS keys, GitHub and Discord tokens, bearer and basic auth, environment-style secrets, emails, Vietnamese phone numbers and high-entropy strings. Discord messages are not built yet, so that path is untested.
5. **Untrusted content.** Logs and file contents are wrapped in `<untrusted_*>` tags before reaching a model or an MCP client.
6. **No Docker socket, no cluster-admin.** The daemon reaches Docker only through the read-only socket proxy. `docker.sock` is mounted only into the two proxies. The Kubernetes source uses the in-cluster ServiceAccount.
7. **No secrets in the repository.** `.env*` is gitignored. Example files hold placeholders. `scripts/kiro/secret-scan.mjs` runs on save through a Kiro hook.
8. **Circuit breaker.** If a haunting reopens within 10 minutes of an action, auto-actions for that service stop. The helper is in `packages/core` and the actuator applies it. **Paging humans needs Discord and is not built.**
9. **Agent model calls.** `packages/gateway` is the single model path, including diagnosis. `apiKeyEnv` names an environment variable. Do not store keys in YAML. The adapter rejects an unset or placeholder key. The gateway redacts model inputs, applies per-Agent and global UTC daily budgets, requires evidence validation and an audit callback on every task. Transport retry follows the gateway config. Validation gets one retry with a redacted reason if budget remains. Diagnosis checks evidence refs and supplies a rules-only fallback. Policy is the authority for permissions. ADR 0009 removed the reference daemon and `packages/llm`.
10. **One read-only config endpoint with a scope.** `GET /api/config/export` is the only config endpoint. It needs a bearer credential from the shared OAuth issuer with `config:export`, and it returns the whole config that `packages/config` validated at boot: `boot`, `agents`, `policy` and `fix`. The sanitized read views and the per-block exports are removed. The endpoint serves the one frozen boot provider; no handler reads a YAML file per request and no write path exists. `apiKeyEnv`, `appIdEnv` and `privateKeyEnv` stay environment variable names, and no environment value is ever resolved. `ThrottlerGuard` runs first, then `AuthGuard('oauth-client-access')` checks the exact scope before the handler reads any config. An anonymous request gets 401, a token without `config:export` gets 403, and an over-limit caller gets 429 before a handler or an audit transaction. `config:export` is HTTP-only: it is in the shared #63 catalog, never in `MCP_READ_SCOPES` or `PLUGIN_SCOPES`, and the create-credential request type does not advertise it, so the document never offers a scope the service denies. `CredentialService.issue` rejects it for both credential kinds. The shared #63 catalog holds one config scope: `config:export`. The older decision in #47 and ticket #73 still describe `config:read` and sanitized reads; the coordinator must update that text. A client can be issued only a scope it already holds. The export writes exactly one audit entry (`type: config.exported`, actor = the authenticated client id, payload = `{ exported: 'config' }`) through `AuditRepo.append` before the response; a failed append fails the request closed and serves no config. No unauthenticated write endpoint exists; the API holds no config write path. A config file change is a reviewed commit and a restart (ADR 0015). `AgentConfigSchema` and `AgentsFileSchema` are strict, so an unknown key stops boot. `PolicySchema` strips unknown keys at boot. E2E tests prove a set secret value, an unknown key with a secret, and a resolved environment value never appear in a response. The API logs no config secret. The dashboard is owned by another frontend engineer; this repo ships contracts and endpoint definitions only.

Management clients exchange registered client credentials for short-lived JWTs. Verification checks issuer, audience, expiry, client registry and project. Credential management requires `tokens:manage`. Named MCP and Plugin Credentials have restricted scopes, expiry and revocation.

Only a one-way hash of an issued Credential enters PostgreSQL. The value is returned once after commit. List responses omit hashes and values. Verification compares hashes in constant time. The active cap and Credential/audit mutation are atomic across instances. Revocation is read from durable state. MCP metadata uses the real stored expiry.

`apps/api/src/audit` keeps audit entries in PostgreSQL, keyed by `project_id` and `seq`, with `at` (UTC), `actor`, `type`, `incident_id`, `payload`, `prev_hash` and `hash`.

- `hash` is SHA-256 over a canonical, key-sorted encoding of `[seq, at, actor, type, incidentId or null, payload, prevHash]`. The first `prevHash` is 64 zeros.
- Enforcement point: the database. The migration `20261121052714_init` creates the function `prevent_audit_entry_mutation()` and two row triggers on `audit_entries`: `audit_entries_no_update` (BEFORE UPDATE) and `audit_entries_no_delete` (BEFORE DELETE). Each trigger raises `audit entries are append-only`, so a direct SQL `UPDATE` or `DELETE` fails. Application code is not the only guard. Prisma does not manage these triggers; the migration SQL holds them in a marked block.
- `AuditRepo.append` runs in a serializable transaction. It takes a per-project advisory lock, reads the last entry, and writes `seq + 1` with the previous hash. A serialization conflict (`P2034`) is tried up to 20 times (19 retries). Services inject `AuditRepo` and never the Prisma client. `payload` is a Prisma `Json` field (PostgreSQL `JSONB`). The core helpers `makeAuditEntry`, `verifyEntries` and `GENESIS_HASH` from `@graveshift/core` are the only chain logic.
- Two seams: `AUDIT_SINK` for a use-case write and `AUDIT_READER` for reads. `apps/api/src/audit/audit.sink.ts` declares both with their tokens and the authenticated `AuditScope`. One `AuditRepo` implements both and adds no store of its own: every record goes through `AuditRepo.append`. A record with a blank `projectId` or `actor` is refused, so a use case cannot create an entry in a chain nobody owns and fails closed instead. `AuditModule` registers that one adapter under both tokens. Tests use `AuditRepo` against the guarded local database; no in-memory audit adapter remains, so a test cannot pass on an unscoped write.
- One scope per request. `AuditScopeInterceptor` binds `{ projectId, actor }` from the verified OAuth principal for the whole handler, and `withAuditScope`/`currentAuditScope` keep that binding for everything the handler awaits. A shared collaborator reads the scope of its own request. No deployment-wide project value exists: no `GRAVESHIFT_PROJECT_ID`, `AUDIT_PROJECT_ID`, `AUDIT_PROJECT_ID_ENV` or `AUDIT_PROJECT_ID_DEFAULT` is read anywhere, and the daemon's audit writer holds no project id of its own.
- The SQLite audit store (`packages/store`, Drizzle, `bun:sqlite`) is removed. No fallback store exists.
- Limit: a database owner can drop the triggers and then change rows. `verifyChain()` detects edits, removal inside the chain and reordering. It does not detect deleted newest entries without publishing the head hash somewhere else.
- `verifyChain()` walks all entries and returns the first broken `seq` with a reason (`sequence gap or reorder`, `prevHash mismatch` or `hash mismatch`). Tests cover edits to any field, removal and reordering, and a payload with a `__proto__` key.
- Credential creation, revocation and first observed expiry write an audit entry in the same PostgreSQL transaction as the credential change.
- The one config export (`GET /api/config/export`) writes exactly one `config.exported` entry before the response. The entry stores `project_id` (the authenticated client's project) and `actor` (the authenticated client id) in their own columns; the `payload` holds only `{ exported: 'config' }`. No config content enters the payload. A failed append fails the request closed: no config is served.

Throttling resolves identity through the same verifier on cold and warm processes. Unknown tokens share the caller's IP bucket. An index warmed by an earlier request cannot change the identity rule. Storage failure does not become an anonymous authorization success.

Private HTTP requires a dedicated internal bearer credential per hop and the configured project. The daemon presents `GRAVESHIFT_API_INTERNAL_TOKEN` to the API, which checks it at every `/internal/*` route. The API presents `GRAVESHIFT_DAEMON_INTERNAL_TOKEN` to the daemon. The two values must differ; boot fails closed when they match. The daemon binds to loopback. External clients use only the API. Private routes are excluded from generated OpenAPI. Keep both internal credentials separate from management JWT secrets and the actuator HMAC secret.

## Event and evidence privacy

Approved event IDs, trace IDs, fingerprints and authorized routing metadata are nonsecret fields with explicit validation. UUID entropy alone does not rewrite them. Recognized secrets or personal data in identity/routing are rejected. Free text, source labels and payloads receive redaction. Sensitive payload fields are removed without collapsing distinct surviving keys.

The MCP audit tools are stubs in v2. `get_audit_log` returns an empty list, and `verify_audit_chain` returns `{ ok: false, unavailable: true }`, because the v2 daemon exposes no audit read API. These tools do not read the PostgreSQL audit chain that this service writes. Tickets #47 and #60 own the real implementations.

## Credentials and event ingest

`apps/api/src/auth` is the only issuer and verifier for MCP tokens and event keys. Credential management uses OAuth 2.1 client credentials: a passport strategy checks a bearer JWT signed with `@nestjs/jwt`. `POST /api/oauth/token` signs a JWT with `iss`, `aud`, `sub`, `scope`, `jti` and `exp` from a boot client registry. The secret has no default; boot fails in every environment when it is unset. A passport strategy requires `iss`, `aud` and `exp` and checks the project against the registry. Throttling covers token, credential, event and MCP routes and the one config endpoint, and keys by client id resolved from the bearer token. The client id comes from the verified principal; no process-local key index is kept, so restart does not change the bucket. A client holds at most ten active credentials, and the cap check runs in the same serialized section as issue. Every MCP HTTP method is scope-checked with deny by default; the route returns 403 for a method outside token scopes. A failed NATS connect clears the cached promise, so a later publish retries and fails closed with 503. Request DTOs use `class-validator`, whitelist, `forbidNonWhitelisted`, transform and 422, so an unknown field fails at the pipe.

PostgreSQL stores a SHA-256 hash, a short display prefix, kind, name, client id, project id, scopes, optional service binding, and timestamps. It never stores the credential value. All values are 32 random bytes encoded as 64 lowercase hex characters. The value appears once in the create response and is never logged. Presented values are hashed and compared in constant time. Credentials issued before this change use base64url values and must be reissued. Expired, revoked, unknown or wrong-kind values deny the call. Issue and revoke serialize on a project-and-client advisory lock; the ten-active-credential limit is checked in the same transaction as issue.

`tokens:manage` is required to manage credentials. The scope catalog is fixed. MCP kinds may carry the six read scopes; event keys may carry `events:publish`. `config:export` is the only scope used by a config route: it is HTTP-only for `GET /api/config/export`, so it never enters a credential of any kind, and a client holds it only through the boot registry of the OAuth issuer. The older decision in #47 and ticket #73 still describe `config:read` and sanitized reads; the coordinator must update that text. `POST /api/credentials` validates and advertises the credential scopes only (`MCP_READ_SCOPES` plus `PLUGIN_SCOPES`), so the published contract never offers a scope the service denies. A Sentry key also has a numeric `projectId` that equals the DSN project id, and a bound Grave in `service`. `POST /api/credentials` returns 422 for a plugin key with a `service` when the issuing OAuth client has a non-numeric `projectId`. It is public by design, so it can only publish events and it is rate-limited. A client cannot grant `admin` or `tokens:manage`, and cannot grant a scope its own token does not hold. `GET /api/credentials` returns metadata only: no value and no hash.

`POST /api/events` checks `events:publish`, the project binding and the optional service binding. A native event key without a service binding may publish for any service in its project. The interceptor bounds the parsed body before validation, and the request rate uses the in-process throttler. The HTTP platform parses JSON with a 100 KB default limit, so `GRAVESHIFT_EVENT_MAX_BYTES` is capped at 102400 bytes; a larger body is refused by Express before the interceptor runs. `EventEnvelopeSchema` from `packages/core` checks the canonical shape, and every string passes through `packages/redactor` before publish. Client apps use the HTTP publisher with a bearer event key and hold no NATS credential.

## Sentry DSN ingest

Create an event Credential with `events:publish` as its only scope, a Grave in `service`, and an OAuth client whose `projectId` is the numeric DSN project id. Configure an official Sentry SDK with `https://<public-key>@<api-host>/<projectId>`. The SDK sends the envelope to `/api/<projectId>/envelope/`. The project id does not name the Grave. The verified Credential's `service` binding selects the Grave and its `projectId` selects the project. The handler checks that the path project id equals the Credential's `projectId`. It does not use event fields for identity or authentication.

The API accepts the key in the SDK's `sentry_key` query parameter, an envelope `dsn` header, or `Authorization: Sentry <key>`. The shared Credential verifier compares hashes in constant time. If more than one key form is present, all values must match. A missing, unknown or mismatched key, project id or binding returns 403. The handler never echoes a key. The request rate is bounded. A 429 response includes `Retry-After` so the SDK can pause sending. Real Sentry SDKs are served by the `sentry_key` query parameter and the envelope `dsn`; `X-Sentry-Auth` is not the SDK path.

The adapter accepts `event` items and skips `session`, `client_report`, `attachment`, `transaction`, `span`, `profile`, replay and metric items. It skips other non-event item types too. The full envelope and each event item are limited to 1 MiB. The adapter maps one event to one `EventEnvelope`, redacts exception, message and request data, validates with `EventEnvelopeSchema`, then publishes through the same injected `Publisher` as `/api/events`.

| Sentry value | Event field | Severity |
| --- | --- | --- |
| Credential project binding | `projectId` | — |
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

The CI e2e suite keeps fakes only at third-party boundaries (publisher and local JWT stub) and makes no external socket call; application repositories and the audit sink are real. To test an official SDK locally, run `env -u CI bun test --tsconfig-override apps/api/tsconfig.json apps/api/test/sentry-sdk.loopback.e2e.test.ts`. The test starts Nest on loopback and sends one SDK event. It uses no Sentry account, NATS endpoint or production Credential.

Preparation accepts JSON data only and validates the serialized envelope again. A publisher cannot acknowledge data that the reader will reject after a privacy rewrite. The same identity policy protects MCP occurrence output.

Medium uses one retained evidence collection for context, citation checks and deterministic fallback. Untrusted text cannot open or close framing sections. Every prompt path uses the shared gateway. Evidence refs remain stable in the final model context.

## Model and policy controls

The gateway owns provider capability checks, cancellation, configured transport retry, one validation correction, Agent/global budgets and terminal audit. An unsupported connector cannot reach a structured-language task. Unknown pricing or usage remains explicit and blocks further acceptance under the configured policy.

A model result is accepted only after durable audit acknowledgement. Audit failure returns no model value and does not run another model call or fallback. Known usage remains visible. API keys come from the Agent's named environment variable; they never enter YAML, config responses or audit payloads.

Policy is pure, deny-first and default deny. The daemon supplies complete recorded Diagnosis and real counters. An unmapped Grave, missing context or unknown counter fails closed. A Human assignment is manual work and cannot invoke auto-fix or Fix now. An Agent assignment selects the exact executing Agent, with its client trigger setting deciding automatic or explicit start.

- The v2 daemon serves only `/healthz` on localhost. The `/mcp` bearer path is checked in-process only, and stdio is unauthenticated by design.
- Consumed actuator token IDs are in memory; a restart inside the 15-minute window forgets them.
- The Kubernetes network policy allows all egress. Egress allowlisting is not done.
- The `pods/log` rule exposes log contents to the daemon. For real users, use a namespace-scoped Role instead of the ClusterRole.
- Agent config requires an HTTPS `baseUrl` without URL credentials. The budget check and charge are separate steps. Concurrent calls can spend more than the daily limit.
- Kubernetes code is tested with fixtures only.
- Expiry audit is written the first time an expired credential is presented; an idle credential does not create an expiry event until a request observes it.
- `GRAVESHIFT_OAUTH_JWT_SECRET` has no default. Set it to a secret of at least 32 characters before boot.
- Without `GRAVESHIFT_NATS_URL`, publish calls fail closed with 503. The API does not buffer envelopes on disk.

## Exorcism publication

The canonical Patch guard runs at generation, publication and separate-process intake. It checks paths, collisions, file count, line limits and actual content. Files that cross a symlink or leave the workspace are rejected.

Verification reads a bounded source snapshot at a fixed base and blob identity, applies the Patch in an isolated workspace and computes actual changes. Commands receive no inherited credentials and have no network access. Timeouts terminate the owned process group. Check output does not become public failure text. A platform that cannot enforce isolation fails closed.

Publication rechecks the source base, owns safe titles/subjects/body text and uses stable full-identity branch keys. It creates `draft: true` and exposes no merge operation. Durable claims and publication intent precede writes. The audit append of `fix.pr_intent` also precedes the GitHub call, and a failed append stops the Fix before any outside write. A Fix attempt whose command carries no authenticated audit scope is denied before the model call, so no budget is spent on a call that cannot be attributed. A known draft ref is retained after labels or a later audit handoff fails. Uncertain effects are reconciled before another write. A fix audit payload holds identifiers and the contract's failure code: a note, a title, a description, a free-text reason, model output, a pull request body, a branch slug and a URL never enter it.

GitHub App credentials are scoped to configured installations. Concurrent refreshes share one pending operation. Separate-process one-shot jobs still validate policy, artifacts and filesystem paths independently; shared algorithms do not remove their checks.

## Privileged runtime actions

The actuator is separate from Fix execution. It checks the canonical request, HMAC, valid Blessing interval, approved person, action binding, named target, scale bounds, safer mode, circuit breaker and rate limit. No Fix path invokes it.

Admission reserves capacity before an asynchronous runtime adapter runs. Required audit acknowledgement precedes the effect. Denials consume neither the token nor capacity. Admitted failures count against the rate window. Bounded history fails closed rather than evicting an unexpired consumed token.

Durable claims protect token and action identity across process restart. A prior incomplete claim is uncertain and cannot authorize another execution. Terminal audit failure retains the known runtime result; it never retries the action. Docker and Kubernetes writers retain narrow capabilities and no general shell execution.

## Audit and database enforcement

Deployment rows are append-only in SQL; only the `closed_at` transition is allowed. The route org is checked against the verified OAuth client. The tenant comes from the Project; there is no org column on Deployment. The `environment` name is limited to `^[A-Za-z0-9._-]{1,100}$` on every wire DTO. Client-supplied `environment` and `title` are redacted before they enter an audit payload.

Each project has one append-only hash chain. A transaction assigns sequence, timestamp, canonical payload, previous hash and hash. PostgreSQL triggers reject UPDATE and DELETE. An exact producer-key retry returns the prior entry; changed facts conflict. Credential changes and their chain entry commit together.

Verification detects edited fields, sequence gaps, reordering and changed hashes. Tail truncation still requires an external head anchor to detect. Database operators retain control over schema and backups; triggers do not replace that operational trust.

Production uses one PostgreSQL store with no file fallback. Application tests use the real adapters against a unique local Docker database with no host data mount. The destructive fixture guard requires the test opt-in, matching run identity and loopback database. CI keeps the existing database lane; ordinary unit tests do not start a database.

## Current operational limits

- Provider budgets are process-local. Reserve capacity before parallel billing, and persist spend before restart-safe daily enforcement is required.
- Kubernetes watch expiry can leave an observation gap. Scope the read role to the namespaces under watch.
- Linux verification requires bubblewrap and was not exercised on this macOS development host. Sandbox startup failure blocks publication.
- Banshee approval collection, webhook delivery and hosted multi-project operation remain deferred.
- Deployment keys, GitHub installation permission and network controls must be configured for the chosen local deployment. No live production system was changed by the architecture verification.
