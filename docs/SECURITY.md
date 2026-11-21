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
9. **Agent model calls.** `packages/gateway` is the single model path for an Agent. It reads each key from the process environment variable named by `apiKeyEnv` in the Agent config, never from YAML, and rejects an unset or placeholder key. Every call applies redaction, a per-Agent and global UTC daily budget, one audit event, transport retry from config, one redacted validation retry, evidence validation and a rules-only fallback. A model output cannot grant a permission. The budget check and the charge are separate steps, so concurrent calls can spend more than the daily limit. Diagnosis still uses `packages/llm`; issue #40 will move it into the gateway.

## Audit chain

`packages/store` keeps one table, `audit_log`, with `seq`, `at` (UTC ISO), `actor`, `type`, `incidentId`, `payload`, `prevHash` and `hash`.

- `hash` is SHA-256 over a canonical, key-sorted encoding of `[seq, at, actor, type, incidentId or null, payload, prevHash]`. The first `prevHash` is 64 zeros.
- SQLite triggers abort every `UPDATE` and `DELETE`.
- `verifyChain()` walks all entries and returns the first broken `seq` with a reason (`sequence gap or reorder`, `prevHash mismatch` or `hash mismatch`). Tests cover edits to any field, removal and reordering, and a payload with a `__proto__` key.
- Limit: deleting the newest entries is not detected without publishing the head hash somewhere else.
- LLM calls are reported through the gateway's audit callback. The daemon writes them to the pino log only, so they are not in the chain yet.

## MCP server

Every tool input has a Zod schema with limits (`list_incidents` at most 50, `get_audit_log` at most 100, `tail_logs` at most 200 lines). `query_metric` accepts only allowlisted metric and function names and range selectors of at most 60 minutes. `propose_fix` returns a policy decision and never executes; its reply says that rate and budget limits are not enforced because the daemon exposes no counters. The HTTP route calls the shared credential component and accepts only an unexpired, unrevoked MCP token with kind `mcp`. The component compares hashes in constant time. The `/mcp` bearer path is tested in-process only (HTTP e2e against the Nest application), not over a real network. The stdio launcher has no authentication by design: it trusts the local process and must only be started by a local user.

## Credentials and event ingest

`apps/api/src/auth` is the only issuer and verifier for MCP tokens and plugin API keys. Credential management uses OAuth 2.1 client credentials: a passport strategy checks a bearer JWT signed with `@nestjs/jwt`. Boot config for the secret, issuer and audience uses a Zod env schema. Request bodies use `class-validator` DTOs with whitelist, `forbidNonWhitelisted`, transform and 422, so an unknown field fails at the pipe.

The store writes one JSON file with mode 0600 and an atomic replace. It keeps a SHA-256 hash, a short display prefix, kind, name, client id, tenant id, scopes, optional service binding and timestamps. It never keeps the value. The value appears once in the create response and is never logged. Presented values are compared in constant time. Expired, revoked, unknown or wrong-kind values deny the call.

`tokens:manage` is required to manage credentials. The scope catalog is fixed. MCP kinds may carry the six read scopes; plugin kinds may carry `events:publish`. A client cannot grant `admin` or `tokens:manage`, and cannot grant a scope its own token does not hold. `GET /api/credentials` returns metadata only: no value and no hash.

`POST /api/events` checks `events:publish`, the tenant binding and the optional service binding. It bounds payload bytes and request rate with the in-process throttler. `EventEnvelopeSchema` from `packages/core` checks the canonical shape, and the payload passes through `packages/redactor` before publish. The API publishes through the injected `Publisher`; client apps use the HTTP publisher with a bearer plugin key and hold no NATS credential. No test uses a real secret, NATS endpoint or network call.

## Known gaps

- The v2 daemon serves only `/healthz` on localhost. The `/mcp` bearer path is checked in-process only, and stdio is unauthenticated by design.
- Consumed actuator token IDs are in memory; a restart inside the 15-minute window forgets them.
- The Kubernetes network policy allows all egress. Egress allowlisting is not done.
- The `pods/log` rule exposes log contents to the daemon. For real users, use a namespace-scoped Role instead of the ClusterRole.
- Agent keys come from the environment variable named by `apiKeyEnv`. The key is never read from YAML, and an unset or placeholder value rejects the adapter. The Agent config schema requires an https `baseUrl` with no URL credentials. Diagnosis still uses the `OPENAI_COMPATIBLE_API_KEY` path in `packages/llm`; issue #40 will unify the two paths. The budget check and the charge are not atomic, so a burst of concurrent calls can spend more than the daily limit.
- Kubernetes code is tested with fixtures only.
- The credential store is one file for one API process. Concurrent writers need an exclusive-lock store.
- A development JWT secret is the default for local use. Set `GRAVESHIFT_OAUTH_JWT_SECRET` to a secret of at least 32 characters in any shared environment.
- Without `GRAVESHIFT_NATS_URL`, publish calls fail closed with 503. The API does not buffer envelopes on disk.
