# Architecture

This describes the code as it exists. Items that are not built are marked **not built**.

The daemon at `apps/daemon` is an Effect v4 skeleton on Bun. ADR 0009 removed the reference daemon and the separate diagnosis gateway.

## Components

| Component | Path | Role |
| --- | --- | --- |
| API | `apps/api` | NestJS app. The only external surface. Serves `GET /healthz`, the OpenAPI document, the Swagger UI, the one scoped config export endpoint (bearer credential with `config:export`), credential routes, native event ingest, Sentry envelope ingest and MCP at `/mcp`. |
| Config | `packages/config` and root `graveshift.config.yaml` | One committed config file with `boot`, `agents`, `policy` and `fix` blocks. Validated once at boot. |
| Credentials | `apps/api/src/auth` | One component that issues, hashes, verifies, lists and revokes MCP credentials and event keys. Values are lowercase hex; PostgreSQL stores one-way hashes. |
| API contract | `packages/api-contract` | Publishes generated TypeScript types and a version marker from the OpenAPI document. |
| Daemon | `apps/daemon` | Effect v4 skeleton on Bun. Serves `GET /healthz` only. |
| Core | `packages/core` | Zod schemas, event envelope, incident state machine, circuit-breaker helper, `RuntimeSource` contract and pure rule engine. |
| Events | `packages/events` | `Publisher` interface, NATS JetStream publisher, an HTTP publisher that posts to the API, and an in-memory fake. No consumer is wired yet. |
| Integrations | `packages/integrations` | Plugin and Collector contract: `Integration`, `Context` and a pure envelope builder. No NATS client import. |
| Audit | `apps/api/src/audit` | Pure hash-chain functions and a PostgreSQL repository. Database triggers reject audit row updates and deletes. The old SQLite audit store (`packages/store`, Drizzle and `bun:sqlite`) is removed; PostgreSQL is the only audit store. |
| Policy | `packages/policy` | YAML loader and `decide()`. Pure and deterministic. |
| Redactor | `packages/redactor` | Twelve ordered detectors, idempotent. |
| Sources | `packages/sources-docker`, `packages/sources-k8s` | `RuntimeSource` implementations. Docker through the socket proxy; Kubernetes through `@kubernetes/client-node`, read-only. |
| Metrics | `packages/metrics` | Prometheus instant-query client and the watcher queries. |
| Wraith | `packages/watcher` | Rules, fingerprint dedupe, per-service incident, Salt-line silences, PromQL poller. |
| Medium | `packages/diagnoser` | Context builder, untrusted wrapping, evidence validation, rules-only fallback. |
| Agents | `packages/agents` | Zod schemas for agent config, system template merge and the routing agent. Pure helpers only; no provider call. |
| Gateway | `packages/gateway` | The single model call path for an Agent. Redaction, daily budgets, audit events, transport retry, one validation retry, evidence validation and rules-only fallback. One thin adapter per official provider package. |
| Exorcist | `packages/fixer` | Patch guard, GitHub App auth, `graveshift/` branches, draft pull requests. No merge call exists. |
| Patch | `packages/patch` | Patch schemas, `generatePatch` and `guardPatch`. The model proposes a Patch. The guard validates it. Policy decides later. |
| Actuator | `packages/actuator` | Separate service. Verifies and executes approved actions. |
| MCP | `apps/api/src/mcp` | `graveshift-mcp` through the official `@nestjs/mcp` module: Streamable HTTP at `/mcp` with a bearer token, plus a stdio launcher. |
| Banshee | `packages/notifier-discord` | **Not built.** Package exports only its name. |

## Incident flow

```text
runtime events / logs / Prometheus
        -> Wraith: detection (dedupe 10 min, one incident per service)
        -> incident `detected`
        -> Medium: diagnosis (Agent through the gateway, else rules-only)
        -> policy decide(open_pr)
        -> Exorcist: draft PR (patch generator: built; daemon wiring: not built)
        -> Banshee: Discord blessing (not built)
        -> Actuator: signed, single-use action (nothing in the daemon requests one yet)
every step -> audit log
```

The state machine lives in `packages/core/src/state.ts`. Incident states: see `INCIDENT_STATES` in `packages/core/src/schemas.ts`. The incident registry is in memory and is lost on restart; the audit log persists.

## Compose mode

`deploy/compose/graveshift.compose.yml` runs support services. It does not start a daemon.

- `socket-proxy`: `tecnativa/docker-socket-proxy`, read-only (`POST=0`).
- `socket-proxy-actuator`: allows container restart only, on an internal network used by the actuator.
- `actuator` (port 2603, not published). It exits at startup if `ACTUATOR_HMAC_SECRET` is shorter than 32 characters.
- `prometheus`, scraping the demo app jobs.

`docker.sock` is mounted into the two proxies and nowhere else.

## Kubernetes mode

`deploy/k8s` holds RBAC and a network policy only. The reader ClusterRole allows get/list/watch (including `pods/log`). The actuator has a namespaced Role limited to patching `api` and `worker` deployments and scaling `worker`. The network policy is a skeleton that allows all egress. There are no Deployments, no kind overlay and no working bootstrap script: **not built** (issue #14). RBAC changes require a change to `.kiro/specs/k8s-deploy`.

## External API

The API in `apps/api` is the only external surface. A client calls this API, never the daemon.

| Route | Returns |
| --- | --- |
| `GET /healthz` | `{status: "ok"}` |
| `GET /docs-json` | The OpenAPI document. |
| `GET /docs` | The Swagger UI. |
| `POST /api/rules/validate` | Override ids, warning and acceptance for a rule set. Validation only. |
| `GET /api/config/export` | The whole validated config in one call: `boot`, `agents`, `policy` and `fix`. Bearer credential with `config:export`. Writes one `config.exported` audit entry. Read-only. The only config endpoint. |
| `GET /api/work-items` | A paged list of work items for the table. |
| `GET /api/work-items/:id` | One work item for the detail sheet. |
| `POST /api/work-items/:id/triage` | The triaged work item. Updates the in-memory store. |
| `POST /api/work-items/:id/fix-now` | The work item after **Fix now** moved it to the front of the fix queue. |
| `POST /api/oauth/token` | Exchanges client id and secret for a short-lived access token. |
| `POST /api/credentials` | One issued credential. The `kind` selects an MCP read token or a plugin publish key. The value is shown once. |
| `GET /api/credentials` | Metadata for the caller credentials. No value or hash. |
| `DELETE /api/credentials/:id` | Revokes one credential. Returns 204. |
| `POST /api/events` | Accepts a native `EventEnvelope` and publishes it. Returns 202. |
| `POST /api/:projectId/envelope/` | Accepts Sentry event items and publishes `EventEnvelope` records. Returns `{ "id": "..." }`. |
| `POST /mcp` | Streamable HTTP MCP endpoint. Requires `Authorization: Bearer <issued MCP token>`. |

The API listens on 127.0.0.1 by default. Set `HOST` to change the bind address. Set `PORT` to change the port from 3000. Keep the localhost bind unless the MCP bearer token is configured and the endpoint is exposed deliberately.

Structured logging is deferred to the production ticket.

Every HTTP request boundary uses `class-validator` DTO classes. The global `ValidationPipe` sets `whitelist`, `forbidNonWhitelisted`, `transform` and 422, so an unknown field fails at the pipe. Zod is used for boot env config, domain schemas and OpenAPI response docs. Business conflicts remain 409 and unknown ids remain 404.

## Prisma migrations

CI compares the SQL generated from `apps/api/prisma/schema.prisma` with the committed migration SQL using `bun run migrate:drift:check`. This is a DB-free alternative to the ticket's literal `prisma migrate diff --from-migrations ... --to-schema ... --exit-code` command. It works only while migrations are additive. When a second or destructive migration lands, move to a shadow-database drift check and ask the coordinator to approve a CI Postgres service or an external test database. The local shadow-database command is `bun run migrate:drift:local`; it needs `DATABASE_URL`, `SHADOW_DATABASE_URL` and Docker Postgres.

## Configuration

One committed root file, `graveshift.config.yaml`, is the config source of truth. It has four blocks: `boot` (host and port), `agents` (the strict Agent file shape), `policy` (the policy schema) and `fix`. The `fix` block holds the boot flag `enabled`, the Agent name, the one patch `promptTemplate`, the gateway budget and price table, and the GitHub App identity names. `packages/config` owns `GraveshiftConfigSchema` and the loader. The API, the actuator and the one-shot scripts load the same file. A missing or invalid file stops boot. No route reads a YAML file per request.

The file holds no secret value. `apiKeyEnv`, `appIdEnv` and `privateKeyEnv` name environment variables. `DATABASE_URL` and the MCP token stay in the environment. The merge of Agent and policy config removes the old split inputs and is recorded in ADR 0015.

`GET /api/config/export` is the only config endpoint. It returns the whole validated config in one call: `boot`, `agents`, `policy` and `fix`. The sanitized read views and the per-block exports are removed. `apps/api/src/config/config.controller.ts` serves the object held by the injected boot provider (`GRAVESHIFT_CONFIG` in `GraveshiftConfigModule`, deep-frozen at load time). No handler reads a YAML file per request. The endpoint has no write path: it exposes `GET` only and no code writes a config file. A route that writes config is an authenticated route owned by a later ticket under #18. `ThrottlerGuard` runs first, then `AuthGuard('oauth-client-access')` verifies the bearer token from the shared OAuth issuer and requires the exact scope `config:export` before the handler reads any config value. There is no separate scope guard. An anonymous request gets 401, a token without `config:export` gets 403, and an over-limit caller gets 429 before a handler or an audit transaction. The export writes exactly one audit entry (`type: config.exported`) through `AuditRepo.append` with identifiers only before the response, and fails closed if the append fails. `GraveshiftConfigSchema` is the OpenAPI response schema, so `packages/api-contract` publishes `ConfigExportResponse` as the one wire type; `packages/api-contract/src/config-contract-assertions.ts` keeps that type complete at compile time. The response holds no secret and no resolved environment value: `apiKeyEnv`, `appIdEnv` and `privateKeyEnv` stay variable names. The shared catalog still lists `config:read` because the owner decision in #47 lists it there, but no route serves it; the coordinator must update #47 and ticket #73, which still ask for sanitized reads. The dashboard is owned by another frontend engineer; this repo ships contracts and endpoint definitions only.

## Work items

A **work item** is created after a haunting is defined and verified. `packages/core` owns `WorkItemSchema`. The generated types in `packages/api-contract` are the wire contract. The frontend consumes these types. The frontend engineer owns the visual design of the table and the detail sheet. The images in the decision report are references only.

A work item carries a title, description, success criteria, subtasks with a completed count, status, priority, assignee, reporter, start date, due date, sprint, parent, labels, team, watchers, severity, service, a diagnosis ref, `fixPriority` and a draft pull request ref. Incident states in `packages/core` stay unchanged. `needs_human` and `needs_agent_<name>` are assignee values, not new incident states. The Agent name comes from the committed config file.

`GET /api/work-items` returns a paged list for the table. `GET /api/work-items/:id` returns one work item for the detail sheet. `POST /api/work-items/:id/triage` accepts an assignee of `needs_human` or an existing `needs_agent_<name>`, validates it and writes the result to the in-memory store. Any other assignee returns 400. A work item in a terminal status returns 409 and does not change. The pure helpers `triageToHuman`, `triageToAgent`, `parseAssignee` and `assertTriageAllowed` in `packages/core` make no model call and change no shared state. They do not decide whether a fix starts; the `fix.enabled` boot flag does. The generated assignee type is `needs_human | needs_agent_${string}`. A work item also carries `fixPriority`: a lower number sits nearer the front of the fix queue. Audit for triage is deferred with the audit chain: no audit event is emitted here.

The API reads Agent names, policy and the `fix.enabled` flag from the one root `graveshift.config.yaml`. The `GraveshiftConfigSchema` nests the strict Agent schema and the policy schema. A missing or invalid file stops boot. The three old inputs `GRAVESHIFT_AUTO_FIX`, `AGENTS_PATH` and `POLICY_PATH` are gone. The store seed is injectable. It is empty by default, so production serves no demo data. Set `GRAVESHIFT_WORK_ITEM_DEMO=true` to load three demo work items for a local demo. E2E tests override the seed, the store, the policy and the fix deps with `Test.createTestingModule()`, so they read no agent file and use no demo data. Persistence is deferred: no database and no event-bus consumer are wired.

## Patches

`packages/patch` holds the patch path. A configured **Agent** proposes a Patch for a **Work item**. The model call goes through `packages/gateway` and is injected. The fix path renders `fix.promptTemplate` from the config into the system prompt. The patch package holds no hard-coded role or persona. `PatchSchema` parses the model output. The guard then checks the Patch: no empty Patch, no file count over the limit, no line count over the limit, no negative or non-integer line count, no unsafe path, no duplicate path, no forbidden path and no path outside `allowedPaths`. Forbidden paths match without case sensitivity. `allowedPaths` keep case sensitivity. `guardPatch` raises one `PatchRejectedError` with all reasons. `generatePatch` returns a typed rejection when the model gives no Patch or an invalid Patch. The guard runs before the caller sees a successful result.

A valid Patch grants no permission and runs no fix. The fix path below uses it.

## Fix paths

A **Work item** enters the fix path in two ways. When the boot config sets `fix.enabled: true`, triage starts the fix without a click: this is **Auto-fix**. A person uses **Fix now** in every case, including when the flag is false. **Fix now** also moves the Work item to the front of the fix queue on success. `POST /api/work-items/:id/fix-now` is the **Fix now** route. Its Zod body may carry a short note. Both ways use one use case in `apps/api/src/fix`.

The use case reads the diagnosis confidence, category, signals and counters from an injected context provider. Missing or malformed values fail closed. It calls `decide()` from `packages/policy` with those values and needs `effect === 'allow'`. If the policy gives `deny`, no Patch is made and no pull request is opened. The **Exorcist** only proposes a Patch through `packages/patch` and `packages/gateway`. The model output cannot grant permission. A human note and the root cause are wrapped as untrusted data only in the PR body. The title, commit subject and branch slug use clean redacted text. The incident id joins the diagnosis ref and the Work item id, so two Work items with one diagnosis get different branches.

`guardPatch` runs before any client call. The **Exorcist** opens a draft pull request through the injectable GitHub client in `packages/fixer`. That client has `createPullRequest({ draft: true })` and no merge method. A draft pull request is the last state of a fix: the **Exorcism** waits for human review. Graveshift does not merge and does not run a runtime action. The draft PR ref is stored on the Work item, and a Work item that already has one is not fixed again. No test calls a GitHub endpoint.

**Fix now** promotes `fixPriority` to the front of the queue only after a successful fix. A denial, a rejected Patch or a failed PR call leaves `fixPriority` unchanged. The fix result carries the policy effect, a failure code and the PR ref, so a client can tell a denial from a started fix. Triage saves its state first and returns the auto-fix outcome, including any failure reason, even when the auto-fix throws. A done Work item cannot be fixed. Audit events for policy decisions and fix outcomes are deferred with the audit chain: no audit sink is wired here, so the denial reason is surfaced in the API result instead.

The model gateway and the GitHub client are real. `createFixDeps` builds them from the validated config and they call the official provider and GitHub APIs. The diagnosis context provider is still closed: no daemon read exists, so the context load fails closed and no fix opens a pull request today. Ticket #59 owns the daemon read and the source-to-PR sandbox. The CI e2e suite injects emulator URLs at the gateway and client seams, so it runs the real use case offline.

## MCP endpoint

The official `@nestjs/mcp` module serves `graveshift-mcp` at `/mcp` from the API. The HTTP route guard and the MCP token verifier both call `CredentialService.verify(token, 'mcp')` from `apps/api/src/auth`. An MCP token is issued with `POST /api/credentials` and kind `mcp`; the old static `GRAVESHIFT_MCP_TOKEN` is no longer read. No OAuth resource or authorization server is advertised on this route. A scope floor checks every MCP HTTP method, including tools, prompts and resources, and denies a method without a scope mapping; `incidents:read` maps to the incident reads, `fix:propose` to `propose_fix`, and the other scopes to their tools. The stdio launcher has no authentication by design.

MCP takes the validated policy from the one boot config provider, so a bad config file stops the API at boot. The nine tools, two prompts and the postmortem resource are injectable providers in `apps/api/src/mcp/`. Every reply passes through the redactor. `propose_fix` returns a policy decision and never executes an action.

The v2 daemon serves only `/healthz`, so backend reads return empty or unavailable results. No counters are available: the `propose_fix` reply states that rate and budget limits are not enforced. Tests inject a fake backend.

`packages/api-contract` generates its types from the OpenAPI document. It exports the generated types and the `API_CONTRACT_VERSION` marker through `package.json#exports` only. It does not define an event envelope or any domain event type. `@graveshift/core` and `@graveshift/events` are public npm packages for the state and event contracts. Their Node exports use built files under `dist/`; Bun workspace consumers use the source exports. Run `bun run build:contracts` before packing them. Do not publish as part of a code change.

## Credentials and event ingest

`apps/api/src/auth` owns one credential component. It issues, hashes, verifies, lists and revokes MCP read tokens and event keys. The MCP module and both event routes call this component; neither builds a second issuer or verifier.

One scope catalog serves MCP tokens, plugin keys and the one HTTP config endpoint. MCP scopes are `incidents:read`, `diagnoses:read`, `audit:read`, `logs:read`, `metrics:read` and `fix:propose`. The event scope is `events:publish`. `config:export` is the exact scope of the one config endpoint and is HTTP-only: it never enters `MCP_READ_SCOPES` or `PLUGIN_SCOPES`, and `CredentialService.issue` rejects it for both credential kinds. `config:read` stays in the catalog for #47 but no route serves it; the coordinator must update that issue and ticket #73. The create-credential request DTO validates and documents `MCP_READ_SCOPES` plus `PLUGIN_SCOPES` only, so the published contract never offers a scope the service denies. The #63 OAuth issuer grants catalog scopes to OAuth clients from the boot registry, and a client can be issued only a scope it holds. `POST /api/credentials` takes `{ kind, name, scopes, service?, ttlSeconds? }`. A Credential takes its one `projectId` from the OAuth client that issues it; the request cannot set it. A plugin Credential with a `service` binding needs a numeric `projectId` (the DSN project id). The create route returns 422 when the issuing OAuth client has a non-numeric `projectId`. A Sentry Credential may only have `events:publish`. Every Credential value has 32 random bytes, encoded as 64 lowercase hex characters. A client chooses scopes from the ones its client-credentials token holds. A client cannot grant `admin` or `tokens:manage`, or a scope it does not hold. A client holds at most ten active credentials; the count and issue run in one serialized section, and revoking one frees a slot. The response shows the value once; `GET /api/credentials` returns metadata only.

`POST /api/oauth/token` runs the OAuth 2.1 client-credentials grant against a boot client registry. It signs a JWT with `iss`, `aud`, `sub`, `scope`, `jti` and `exp` through `@nestjs/jwt`. A passport strategy validates those claims and the registry project. The JWT secret has no default and is required in every environment. Throttling covers the token, credential, event and MCP routes and keys by client id resolved from the bearer token. The NATS connection promise is shared, a failed connect clears the cache and publish fails closed with 503. PostgreSQL stores a SHA-256 hash, a short display prefix, kind, name, client id, project id, scopes, optional service binding and timestamps. It holds no credential value. Presented values are compared in constant time.

`POST /api/events` accepts a native event. Its `class-validator` DTO rejects unknown fields with 422, then `EventEnvelopeSchema` from `packages/core` checks the canonical shape. The route checks `events:publish`, project and service binding, bounds payload bytes and request rate, redacts every string and publishes through the injected `Publisher`. It returns 202. Client apps use `createHttpPublisher` from `packages/events` with a bearer event key. They do not hold NATS credentials.

`POST /api/:projectId/envelope/` adapts official Sentry SDK events. A host sets its DSN to `https://<public-key>@<api-host>/<numeric-project-id>`. The SDK sends an envelope to `/api/<numeric-project-id>/envelope/`. The numeric path value is the project id and also the SDK routing value. The adapter verifies the key as a plugin Credential, checks its `projectId` against the path, and uses its `service` binding as the Grave and its `projectId` as the project. Event fields cannot set the project or Grave. The key may arrive in the SDK's `sentry_key` query parameter, an envelope `dsn` header, or `Authorization: Sentry <key>`. All supplied key forms must match. Missing or mismatched keys return 403. The key must have `events:publish` as its only scope, and requests are rate-limited. The API never returns the key.

The adapter accepts `event` items and skips other item types, including `session`, `client_report`, `attachment`, `transaction`, `span`, `profile`, replay and metric items. It also skips unknown non-event types. It parses line-framed and length-prefixed payloads, with a 1 MiB limit for the full request and each event item. It redacts exception, message and request data, validates the mapped event with `EventEnvelopeSchema`, and publishes through the same `Publisher` and NATS lane as `/api/events`. It returns HTTP 200 with `{ "id": "<event_id>" }`; a rate limit returns 429 with `Retry-After`.

| Sentry value | `EventEnvelope` field |
| --- | --- |
| Credential project binding | `projectId` |
| Credential service binding (Grave) | `service` |
| Envelope `event_id`, then event `event_id` | `id` |
| `sentry` | `source` |
| Exception type, or `event` | `type` as `sentry.<type>` |
| `fatal`, `error` | `severity: critical` |
| `warning` | `severity: warning` |
| `info`, `debug`, or another level | `severity: info` |
| `timestamp`, else envelope `sent_at`, else ingestion time | `observedAt` |
| `contexts.trace.trace_id`, or event id | `traceId` |
| Sentry fingerprint, or type + culprit + message | `fingerprint` |
| Exception, message and request data | Redacted `payload` |

## Event backbone

Every Plugin and Collector publishes one **Event envelope** to the queue. `EventEnvelopeSchema` in `packages/core` is the source of truth. The envelope carries `projectId` from v2. Its `id` is the idempotency key that makes at-least-once delivery safe.

Two lanes carry envelopes:

| Lane | Severity | Use |
| --- | --- | --- |
| `telemetry` | `info` | Baselines and charts. |
| `detection` | `warning`, `critical` | Detection by the Wraith. |

`packages/events` owns the `Publisher` interface, `createNatsPublisher`, `createHttpPublisher` and an in-memory fake under `./testing`. Subjects have the form `graveshift.<projectId>.<lane>.<type>`. The NATS publisher uses the official NATS client packages `@nats-io/transport-node` and `@nats-io/jetstream`, and sends the envelope `id` as the `msgID` option. The NATS connection code is under `./nats`; it is not loaded when a caller imports only `Publisher`, the HTTP publisher or the fake. The HTTP publisher posts an envelope to `/api/events` with a bearer plugin key. The API publishes the envelope to JetStream after validation and redaction.

The JetStream stream is `GRAVESHIFT_EVENTS`. It filters subjects with `graveshift.>`. JetStream detects duplicate publishes by `msgID` inside `duplicate_window`. The default `duplicate_window` is two minutes. Redelivery after that window is not idempotent: a consumer must still handle a repeated envelope `id`.

The daemon wiring is still deferred. The rule engine is in `packages/core`, and the API only validates rule overrides.

## Plugins and Collectors

A **Plugin** is an in-process integration shipped into a client framework. A **Collector** is a daemon-side integration that reads infrastructure or cloud state. Both implement the `Integration` contract in `packages/integrations`: a name, a kind, `start()` and `stop()`. The host gives each one a `Context` with a `Publisher`, a `projectId` and a `service`. The `service` names the **Grave** under watch. The contract also builds a valid **Event envelope** from `packages/core` with a `traceId`, `fingerprint` and severity. Its entry point imports no NATS client.

Official Sentry SDKs replace framework-specific host plugins. The host changes the DSN host to the API and sets the numeric project id from its Credential. The API adapter verifies the key, resolves the Grave from the Credential's service binding, redacts the event, and publishes a canonical envelope. The host does not import a Graveshift plugin or hold a NATS credential.

A Collector example lives in the contract tests: a fake source that publishes one envelope when started. Docker, Kubernetes, Prometheus and cloud Collectors are out of scope. Rule evaluation stays in the daemon. No Plugin or Collector evaluates a rule.

## Rule engine

One engine evaluates every **Event envelope**. The engine lives in `packages/core/src/rules.ts`. `RuleSchema` defines an `id`, `enabled`, an explicit `priority`, a `match` object and an `action`: `detect`, `suppress`, `escalate` or `telemetry`. The match object filters by severities, services, event types and `projectId`. Each filter is optional. `evaluateEnvelope` sorts rules by priority, then by id. The engine calls no model and writes no data.

Two layers feed the one engine. System rules give defaults. Client rules override a system rule with the same `id`. This is a **Rule override**. `mergeRules` keeps system rules when the client has no entry for that id. `detectRuleOverrides` returns the ids that would be overridden and a ready-to-display warning. The config warns the user before save and needs explicit confirmation when a Rule override exists.

`POST /api/rules/validate` validates system and client rule arrays with `ValidateRulesDto`. It returns the override ids and warning. It rejects a Rule override unless the body sets `confirmOverrides: true`. The route stores no rule and evaluates no event. Rule evaluation stays in the daemon. It never runs in a **Plugin** or a **Collector**.

When no rule matches, `info` returns `telemetry`; `warning` and `critical` return `detect`. A rule may suppress an info event, but an info event cannot enter detection through a `detect` or `escalate` action.

The audit event for Rule override detection is deferred with the rest of the audit work.

## Agent config

An **Agent** is a configured Ghost. Its config block holds a name, slug, role, description with trigger keywords, prompt, params, provider package, model, `baseUrl`, `apiKeyEnv`, allowed tools, daily budget and escalation target. `packages/agents` owns the Zod schemas and pure helpers. The schema is strict: an unknown key, including a key value, fails validation. `baseUrl` must use https and carry no URL credentials. `apiKeyEnv` must be `GRAVESHIFT_*` or end with `_API_KEY`. This is a naming guard only; it does not check which secret the variable holds. The gateway in ticket #26 enforces the credential allowlist.

The root `graveshift.config.yaml` holds the `agents.system` list with three named Agents: an Exorcist, an SRE Agent and a DevOps Agent. Each one names a model, a `baseUrl` and an `apiKeyEnv`. The Exorcist is the Agent that owns patches; `fix.agent` names it. `PROVIDER_PACKAGES` accepts every first-party `@ai-sdk/*` connector package: text, image, audio, video, embedding, gateway and OpenAI-compatible connectors. Core, UI and tooling packages such as `@ai-sdk/react` and `@ai-sdk/provider` are rejected. `packages/agents` installs no provider package; the model call stays injected. The `client` list replaces a whole system Agent with the same name; it does not merge fields. `mergeAgentTemplates` applies this client override: the client block wins and the other system Agents stay. `name` is the display label. `slug` is the stable lower-case reference used by `escalateTo`; it is not the display name. Duplicate names or slugs in either list and an `escalateTo` that does not reference an existing slug fail validation.

Each param is one key-value map. Its key is a `{{PARAM}}` placeholder in the prompt. The YAML value is a **default**: the routing agent uses it when the request has no value for that param. An empty value means there is no default. Params and placeholders must declare each other, and param names must be unique. A missing param without a default leads to one question to the user. If the param is still missing, the result is `needs_human` with a reason.

The **Routing agent** is a built-in role. It reads a request and selects a target Agent by the trigger keywords in the description. When two Agents score the same, the first Agent in the list wins. Request text and filled param values are wrapped as `<untrusted_*>` data before they enter any prompt, using the same convention as the diagnoser. The question is written through an injected `RoutingModel` interface. This package imports no provider package and makes no model call.

## Gateway

The gateway in `packages/gateway` makes every model call for an **Agent**. No other package calls a model for an Agent. One call uses one thin adapter for the provider package named in the Agent config. The adapter uses an official `@ai-sdk/*` package. There is no hand-written HTTP adapter and no vendor chain.

The gateway reads the API key from the process environment variable named by `apiKeyEnv`. It never reads a key from YAML. An unset key or a placeholder value rejects the adapter.

Every call applies these controls:

- Redaction of the system prompt, the prompt and any untrusted content before the model.
- A daily budget in UTC, checked for the Agent and for Graveshift as a whole.
- A required evidence/output validator and one required audit callback on every terminal path. Audit events carry `agent`, `task`, `status`, token counts and cost. An audit callback failure fails the call rather than returning an unaudited result.
- Transport retry from config. The gateway owns the retry; the SDK does not retry.
- At most one validation retry. The validation reason is redacted before the model sees it again.
- Evidence validation and a deterministic rules-only fallback. This fallback runs when the output is invalid, the provider is unavailable or the budget is used up.

Model output cannot grant a permission. The gateway runs no tool and returns no permission grant. A Ghost gets its permission from policy.

Diagnosis and patch generation both use the selected Agent through `packages/gateway`.

The budget check and the charge are two separate steps. Concurrent calls can spend more than the daily limit. A reservation taken before the model call is the upgrade path when the daemon runs calls in parallel.

## Daemon local surface

The daemon keeps only health and a local command inbox (**not built**). It listens on port 2602 and binds to 127.0.0.1 by default. The `PORT` environment variable changes the port. No client calls the daemon directly. Keep the bind on localhost.

## GitHub Actions

Actions runs one-shot jobs only. The platform invokes the reusable `workflow_call` workflow with a work item id, a `graveshift/` branch slug, a base ref, a full base commit SHA, a guarded patch payload, a signed policy decision and a PR title. Both jobs validate `base_ref` against `GRAVESHIFT_ALLOWED_BASE_REFS` before checkout. The scripts and policy come from the exact repository variable `GRAVESHIFT_TRUSTED_WORKFLOW_SHA`, never from the target base ref. An unset allowlist or trusted SHA fails closed. Set that variable to a reviewed commit that contains the workflow scripts and policy.

The `policy_decision` input is signed with HMAC-SHA256 by the platform. `GRAVESHIFT_POLICY_SIGNING_KEY` must be a 32-byte or longer secret set both for the platform caller and the repository. The signature covers the canonical sorted-key JSON decision, repository, work item id, incident ref, branch slug, base ref, full base commit SHA, PR title, SHA-256 of the raw patch payload, issue time and expiry. The window is at most five minutes. Both jobs verify the signature and re-evaluate the context with `decide()` from trusted policy. A missing, stale, altered or mis-bound signature fails closed. `repoRules()` fails closed for a repository with no policy entry. No model key or model call exists in Actions.

The caller uses `signPolicyDecision` in `scripts/actions/policy-signature.ts` after `decide()` returns `allow`, then passes the returned `policyDecision` and `signature` as `policy_decision` and `policy_signature`. The `base_sha` input is the exact commit from which the patch was prepared. Both jobs have a read-only `GITHUB_TOKEN`; only the separate `pr_token` can push or open a PR. `GRAVESHIFT_TRUSTED_WORKFLOW_SHA` must be advanced only after the workflow code is reviewed.

`bun run test:database` starts a separate Docker Postgres with test credentials, applies migrations, checks persistence, concurrent caps, rollback, expiry and audit triggers, then removes that test container and network. CI runs the unit/API tests and schema checks; it does not start a database. The initial migration is still part of the unmerged database foundation and is tested on a fresh database.

The `patch` job checks the payload size, parses it with `packages/patch` schemas and trusted repo rules, redacts file content and writes a sanitized `patch.json` artifact. It runs with `contents: read` only.

The `open-pr` job checks out the requested base into a separate data directory. Trusted code validates the artifact again, rejects paths that cross a symlink or leave that directory, writes the files, commits them to the `graveshift/` branch with an explicit author identity, pushes that branch and opens one draft pull request. A retry reuses the same remote branch only when its tree matches; it never force-pushes different content. If a draft PR already exists, the workflow reuses it. No daemon, no long-running server, no merge and no runtime action run in Actions.

`workflow_dispatch` still needs a valid platform signature. The human cannot create a grant by typing their own policy context. `pr_token` must be a fine-grained, repository-scoped PAT that can push to `graveshift/` branches and open draft PRs. The `permissions` block bounds only `GITHUB_TOKEN`: it does not bound a caller-supplied token, so keep the PAT narrowly scoped and rotate it. The encoded git auth is masked before git uses it.

## Decisions

The system-wide decisions are in `docs/adr/`, in this order:

- `0001-full-scope-for-kiroween.md`
- `0002-single-ai-sdk-provider.md` (superseded by 0007)
- `0003-platform-v2-starts-now.md`
- `0004-effect-v4-daemon-on-bun.md`
- `0005-event-backbone-nats.md`
- `0006-nestjs-api-and-mcp.md`
- `0007-configurable-agents-and-providers.md`
- `0008-fix-paths-and-safety.md`
- `0009-remove-v1-daemon-and-diagnosis-model-path.md`
- `0010-mcp-events-extension-beta.md`
- `0011-yaml-config-with-read-only-api.md` (superseded by 0015)
- `0012-postgresql-durable-store.md`
- `0013-credentials-in-database.md`
- `0014-official-sentry-sdks-for-supported-frameworks.md`
- `0015-one-config-file-at-boot.md`
- `0016` is reserved for #59.
- `0017-deployment-topology.md`
