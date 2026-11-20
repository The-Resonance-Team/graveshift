# Architecture

This describes the code as it exists. Items that are not built are marked **not built**.

The v1 daemon is at `apps/_daemon`. It is reference only. The repository does not build it and does not start it. The new daemon at `apps/daemon` is an Effect v4 skeleton on Bun. It has no use cases yet.

## Components

| Component | Path | Role |
| --- | --- | --- |
| API | `apps/api` | NestJS app. The only external surface. Serves `GET /healthz`, the OpenAPI document, the Swagger UI and the MCP endpoint at `/mcp`. |
| API contract | `packages/api-contract` | Publishes generated TypeScript types and a version marker from the OpenAPI document. |
| Daemon (v1) | `apps/_daemon` | Reference only. Wires Wraith, Medium, policy, optional fixer and the audit log. Not built and not started. |
| Daemon (v2) | `apps/daemon` | New Effect v4 skeleton on Bun. Serves `GET /healthz` only. |
| Core | `packages/core` | Zod schemas (source of truth), event envelope schema, incident state machine, circuit-breaker helper, config loader, `RuntimeSource` contract, pure rule engine. |
| Events | `packages/events` | `Publisher` interface, NATS JetStream publisher and an in-memory fake. No consumer is wired yet. |
| Integrations | `packages/integrations` | Plugin and Collector contract: `Integration`, `Context` and a pure envelope builder. No NATS client import. |
| NestJS plugin | `packages/plugin-nestjs` | In-process Plugin. Publishes one envelope per HTTP request and one for an unhandled error. |
| Store | `packages/store` | Hash-chained, append-only audit log on `bun:sqlite` through Drizzle. |
| Policy | `packages/policy` | YAML loader and `decide()`. Pure and deterministic. |
| Redactor | `packages/redactor` | Twelve ordered detectors, idempotent. |
| Sources | `packages/sources-docker`, `packages/sources-k8s` | `RuntimeSource` implementations. Docker through the socket proxy; Kubernetes through `@kubernetes/client-node`, read-only. |
| Metrics | `packages/metrics` | Prometheus instant-query client and the watcher queries. |
| Wraith | `packages/watcher` | Rules, fingerprint dedupe, per-service incident, Salt-line silences, PromQL poller. |
| Medium | `packages/diagnoser` | Context builder, untrusted wrapping, evidence validation, rules-only fallback. |
| LLM | `packages/llm` | `LlmGateway`: the diagnosis-only model path from ADR 0002. It keeps the same controls but does not use the Agent gateway yet. Issue #40 will move it. |
| Agents | `packages/agents` | Zod schemas for agent config, system template merge and the routing agent. Pure helpers only; no provider call. |
| Gateway | `packages/gateway` | The single model call path for an Agent. Redaction, daily budgets, audit events, transport retry, one validation retry, evidence validation and rules-only fallback. One thin adapter per official provider package. |
| Exorcist | `packages/fixer` | Patch guard, GitHub App auth, `graveshift/` branches, draft pull requests. No merge call exists. |
| Patch | `packages/patch` | Patch schemas, `generatePatch` and `guardPatch`. The model proposes a Patch. The guard validates it. Policy decides later. |
| Actuator | `packages/actuator` | Separate service. Verifies and executes approved actions. |
| MCP | `apps/api/src/mcp` | `graveshift-mcp` through the official `@nestjs/mcp` module: Streamable HTTP at `/mcp` with a bearer token, plus a stdio launcher. |
| Banshee | `packages/notifier-discord` | **Not built.** Package exports only its name. The daemon uses a no-op `Notifier`. |

## Incident flow

```text
runtime events / logs / Prometheus
        -> Wraith: detection (dedupe 10 min, one incident per service)
        -> incident `detected`
        -> Medium: diagnosis (LLM through LlmGateway, else rules-only)
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
| `GET /api/work-items` | A paged list of work items for the table. |
| `GET /api/work-items/:id` | One work item for the detail sheet. |
| `POST /api/work-items/:id/triage` | The triaged work item. Updates the in-memory store. |
| `POST /api/work-items/:id/fix-now` | The work item after **Fix now** moved it to the front of the fix queue. |
| `POST /mcp` | Streamable HTTP MCP endpoint. Requires `Authorization: Bearer <GRAVESHIFT_MCP_TOKEN>`. |

The API listens on 127.0.0.1 by default. Set `HOST` to change the bind address. Set `PORT` to change the port from 3000. Keep the localhost bind unless the MCP bearer token is configured and the endpoint is exposed deliberately.

Structured logging is deferred to the production ticket.

The API uses Zod through Nest's standard-schema pipe. When a route takes input, the route attaches a Zod schema with `@Body({ schema })`, `@Query({ schema })` or `@Param({ schema })`. No business logic, rate limits or SSE were added to the HTTP routes here. MCP is served by the official module at `/mcp`; its bearer token is the only authentication on this surface. Later tickets add the routes for graves and hauntings here.

## Work items

A **work item** is created after a haunting is defined and verified. `packages/core` owns `WorkItemSchema`. The generated types in `packages/api-contract` are the wire contract. The frontend consumes these types. The frontend engineer owns the visual design of the table and the detail sheet. The images in the decision report are references only.

A work item carries a title, description, success criteria, subtasks with a completed count, status, priority, assignee, reporter, start date, due date, sprint, parent, labels, team, watchers, severity, service, a diagnosis ref and the `autoFixAllowed` flag. Incident states in `packages/core` stay unchanged. `needs_human` and `needs_agent_<name>` are assignee values, not new incident states. The agent name comes from agent config in `packages/agents`.

`GET /api/work-items` returns a paged list for the table. `GET /api/work-items/:id` returns one work item for the detail sheet. `POST /api/work-items/:id/triage` accepts an assignee of `needs_human` or an existing `needs_agent_<name>`, validates it and writes the result to the in-memory store. Any other assignee returns 400. A work item in a terminal status returns 409 and does not change. The pure helpers `triageToHuman`, `triageToAgent`, `parseAssignee` and `assertTriageAllowed` in `packages/core` make no model call and change no shared state. They set `autoFixAllowed` from client config. The generated assignee type is `needs_human | needs_agent_${string}`. A work item also carries `fixPriority`: a lower number sits nearer the front of the fix queue. Audit for triage is deferred with the audit chain: no audit event is emitted here.

The API reads agent names from `AGENTS_PATH` (default `agents.example.yaml`) and the client auto-fix switch from `GRAVESHIFT_AUTO_FIX` (default false). A missing or invalid `AGENTS_PATH` fails boot with a `WORK_ITEM_POLICY_INVALID` error. The store seed is injectable. It is empty by default, so production serves no demo data. Set `GRAVESHIFT_WORK_ITEM_DEMO=true` to load three demo work items for a local demo. E2E tests override the seed, the store, the policy and the fix deps with `Test.createTestingModule()`, so they read no agent file and use no demo data. Persistence is deferred: no database and no event-bus consumer are wired.

## Patches

`packages/patch` holds the patch path. A configured **Agent** proposes a Patch for a **Work item**. The model call goes through `packages/gateway` and is injected. `PatchSchema` parses the model output. The guard then checks the Patch: no empty Patch, no file count over the limit, no line count over the limit, no negative or non-integer line count, no unsafe path, no duplicate path, no forbidden path and no path outside `allowedPaths`. Forbidden paths match without case sensitivity. `allowedPaths` keep case sensitivity. `guardPatch` raises one `PatchRejectedError` with all reasons. `generatePatch` returns a typed rejection when the model gives no Patch or an invalid Patch. The guard runs before the caller sees a successful result.

A valid Patch grants no permission and runs no fix. The fix path below uses it.

## Fix paths

A **Work item** enters the fix path in two ways. When the client config sets `autoFixAllowed`, the fix starts without a click: this is auto-fix. When the client turns auto-fix off, a person uses **Fix now**. **Fix now** also moves the Work item to the front of the fix queue. `POST /api/work-items/:id/fix-now` is the **Fix now** route. Its Zod body may carry a short note. Both ways use one use case in `apps/api/src/fix`. Auto-fix runs only when `autoFixAllowed` is true.

The use case reads the diagnosis confidence, category, signals and counters from an injected context provider. Missing or malformed values fail closed. It calls `decide()` from `packages/policy` with those values and needs `effect === 'allow'`. If the policy gives `deny`, no Patch is made and no pull request is opened. The **Exorcist** only proposes a Patch through `packages/patch` and `packages/gateway`. The model output cannot grant permission. A human note and the root cause are wrapped as untrusted data only in the PR body. The title, commit subject and branch slug use clean redacted text. The incident id joins the diagnosis ref and the Work item id, so two Work items with one diagnosis get different branches.

`guardPatch` runs before any client call. The **Exorcist** opens a draft pull request through the injectable GitHub client in `packages/fixer`. That client has `createPullRequest({ draft: true })` and no merge method. A draft pull request is the last state of a fix: the **Exorcism** waits for human review. Graveshift does not merge and does not run a runtime action. The draft PR ref is stored on the Work item, and a Work item that already has one is not fixed again. No test calls a GitHub endpoint.

**Fix now** promotes `fixPriority` to the front of the queue only after a successful fix. A denial, a rejected Patch or a failed PR call leaves `fixPriority` unchanged. The fix result carries the policy effect, a failure code and the PR ref, so a client can tell a denial from a started fix. Triage saves its state first and returns the auto-fix outcome, including any failure reason, even when the auto-fix throws. A done Work item cannot be fixed. Audit events for policy decisions and fix outcomes are deferred with the audit chain: no audit sink is wired here, so the denial reason is surfaced in the API result instead.

In production wiring there is no diagnosis context provider and no model gateway: the context load fails closed, so **Fix now** and auto-fix never open a pull request today. The e2e tests replace those collaborators with fakes and run the real use case, so they exercise the PR path that production cannot reach yet.

## MCP endpoint

The official `@nestjs/mcp` module serves `graveshift-mcp` at `/mcp` from the API. A guard checks one static bearer token from `GRAVESHIFT_MCP_TOKEN` (32 or more characters) on the HTTP route. No OAuth resource or authorization server is configured: static bearer auth is the only supported path today. The stdio launcher has no authentication by design.

MCP loads the policy in a provider factory, so a bad `POLICY_PATH` stops the API at boot. The nine tools, two prompts and the postmortem resource are injectable providers in `apps/api/src/mcp/`. Every reply passes through the redactor. `propose_fix` returns a policy decision and never executes an action.

The v2 daemon serves only `/healthz`, so backend reads return empty or unavailable results. No counters are available: the `propose_fix` reply states that rate and budget limits are not enforced. Tests inject a fake backend.

`packages/api-contract` generates its types from the OpenAPI document. It exports the generated types and the `API_CONTRACT_VERSION` marker through `package.json#exports` only. It does not define an event envelope or any domain event type.

## Event backbone

Every Plugin and Collector publishes one **Event envelope** to the queue. `EventEnvelopeSchema` in `packages/core` is the source of truth. The envelope carries `tenantId` from v2. Its `id` is the idempotency key that makes at-least-once delivery safe.

Two lanes carry envelopes:

| Lane | Severity | Use |
| --- | --- | --- |
| `telemetry` | `info` | Baselines and charts. |
| `detection` | `warning`, `critical` | Detection by the Wraith. |

`packages/events` owns the `Publisher` interface, `createNatsPublisher` and an in-memory fake under `./testing`. Subjects have the form `graveshift.<tenantId>.<lane>.<type>`. The publisher uses the official NATS client packages `@nats-io/transport-node` and `@nats-io/jetstream`, and sends the envelope `id` as the `msgID` option. The NATS connection code is under `./nats`; it is not loaded when a caller imports only `Publisher` or the fake.

The JetStream stream is `GRAVESHIFT_EVENTS`. It filters subjects with `graveshift.>`. JetStream detects duplicate publishes by `msgID` inside `duplicate_window`. The default `duplicate_window` is two minutes. Redelivery after that window is not idempotent: a consumer must still handle a repeated envelope `id`.

The daemon wiring is still deferred. The rule engine is in `packages/core`, and the API only validates rule overrides.

## Plugins and Collectors

A **Plugin** is an in-process integration shipped into a client framework. A **Collector** is a daemon-side integration that reads infrastructure or cloud state. Both implement the `Integration` contract in `packages/integrations`: a name, a kind, `start()` and `stop()`. The host gives each one a `Context` with a `Publisher`, a `tenantId` and a `service`. The `service` names the **Grave** under watch. The contract also builds a valid **Event envelope** from `packages/core` with a `traceId`, `fingerprint` and severity. Its entry point imports no NATS client.

`packages/plugin-nestjs` is the first Plugin. It exposes an `init(app)` function, not a Nest module. A host calls `init(nestApp)` to get the Integration, then calls `integration.start({ publisher, tenantId, service })` before `app.init()`. The request middleware publishes one info **Event envelope** when each response finishes. A global interceptor publishes one envelope for a handler error and rethrows it, so Nest's exception layer still writes the normal response. The plugin uses Nest's `useGlobalInterceptors()`, not a bespoke exception filter. Guard errors and unmatched routes bypass interceptors, so the plugin observes handler errors only. `stop()` disables publishing without detaching handlers; a later `start()` registers a new generation, so the old handlers stay silent.

An `HttpException` below 500 produces an info envelope; a server error or an unknown exception produces a critical envelope. Untrusted values are redacted before publish: the query string is stripped from the URL, and the path and exception message pass through the repo redactor. The plugin never logs the raw error. The middleware creates one `traceId` per request and keeps it in a `WeakMap`; the interceptor reuses it, so the request and error envelopes share a trace. An incoming `x-trace-id` header is redacted, cut to 128 characters and accepted only as a safe token; otherwise a generated id is used. Request fingerprints use the HTTP method and a normalized route with identifier segments collapsed; error fingerprints also include the exception name.

The host context is validated once at `start()`: an invalid context throws at startup, because a misconfigured host must not run with a broken publisher. Only the per-request publish path fails open, catching build and publish errors so telemetry cannot break a host request.

A Collector example lives in the contract tests: a fake source that publishes one envelope when started. Docker, Kubernetes, Prometheus and cloud Collectors are out of scope. Rule evaluation stays in the daemon. No Plugin or Collector evaluates a rule.

## Rule engine

One engine evaluates every **Event envelope**. The engine lives in `packages/core/src/rules.ts`. It is pure: no runtime, no I/O and no NATS import. `RuleSchema` defines an `id`, `enabled`, an explicit `priority`, a `match` object and an `action`. An action is `detect`, `suppress` or `escalate`. The match object filters by severities, services, event types and `tenantId`. Each filter is optional. `evaluateEnvelope` sorts rules by priority, then by id, and returns the action of the first matching enabled rule. Without a match it returns `detect`. The engine calls no model and writes no data.

Two layers feed the one engine. System rules give defaults. Client rules override a system rule with the same `id`. This is a **Rule override**. `mergeRules` keeps system rules when the client has no entry for that id. `detectRuleOverrides` returns the ids that would be overridden and a ready-to-display warning. The config warns the user before save and needs explicit confirmation when a Rule override exists.

`POST /api/rules/validate` validates system and client rule arrays with Zod. It returns the override ids and warning. It rejects a Rule override unless the body sets `confirmOverrides: true`. The route stores no rule and evaluates no event. Rule evaluation stays in the daemon. It never runs in a **Plugin** or a **Collector**.

The audit event for Rule override detection is deferred with the rest of the audit work.

## Agent config

An **Agent** is a configured Ghost. Its config block holds a name, slug, role, description with trigger keywords, prompt, params, provider package, model, `baseUrl`, `apiKeyEnv`, allowed tools, daily budget and escalation target. `packages/agents` owns the Zod schemas and pure helpers. The schema is strict: an unknown key, including a key value, fails validation. `baseUrl` must use https and carry no URL credentials. `apiKeyEnv` must be `GRAVESHIFT_*` or end with `_API_KEY`. This is a naming guard only; it does not check which secret the variable holds. The gateway in ticket #26 enforces the credential allowlist.

`agents.example.yaml` holds a `system` list with two Agent templates: an SRE Bot and a DevOps Bot. Each one names a model, a `baseUrl` and an `apiKeyEnv`. `PROVIDER_PACKAGES` accepts every first-party `@ai-sdk/*` connector package: text, image, audio, video, embedding, gateway and OpenAI-compatible connectors. Core, UI and tooling packages such as `@ai-sdk/react` and `@ai-sdk/provider` are rejected. `packages/agents` installs no provider package; the model call stays injected. The `client` list replaces a whole system Agent with the same name; it does not merge fields. `mergeAgentTemplates` applies this client override: the client block wins and the other system Agents stay. `name` is the display label. `slug` is the stable lower-case reference used by `escalateTo`; it is not the display name. Duplicate names or slugs in either list and an `escalateTo` that does not reference an existing slug fail validation.

Each param is one key-value map. Its key is a `{{PARAM}}` placeholder in the prompt. The YAML value is a **default**: the routing agent uses it when the request has no value for that param. An empty value means there is no default. Params and placeholders must declare each other, and param names must be unique. A missing param without a default leads to one question to the user. If the param is still missing, the result is `needs_human` with a reason.

The **Routing agent** is a built-in role. It reads a request and selects a target Agent by the trigger keywords in the description. When two Agents score the same, the first Agent in the list wins. Request text and filled param values are wrapped as `<untrusted_*>` data before they enter any prompt, using the same convention as the diagnoser. The question is written through an injected `RoutingModel` interface. This package imports no provider package and makes no model call.

## Gateway

The gateway in `packages/gateway` makes every model call for an **Agent**. No other package calls a model for an Agent. One call uses one thin adapter for the provider package named in the Agent config. The adapter uses an official `@ai-sdk/*` package. There is no hand-written HTTP adapter and no vendor chain.

The gateway reads the API key from the process environment variable named by `apiKeyEnv`. It never reads a key from YAML. An unset key or a placeholder value rejects the adapter.

Every call applies these controls:

- Redaction of the system prompt, the prompt and any untrusted content before the model.
- A daily budget in UTC, checked for the Agent and for Graveshift as a whole.
- One audit event on every terminal path. It carries `agent`, `task`, `status`, token counts and cost.
- Transport retry from config. The gateway owns the retry; the SDK does not retry.
- At most one validation retry. The validation reason is redacted before the model sees it again.
- Evidence validation and a deterministic rules-only fallback. This fallback runs when the output is invalid, the provider is unavailable or the budget is used up.

Model output cannot grant a permission. The gateway runs no tool and returns no permission grant. A Ghost gets its permission from policy.

There are two model paths today. `packages/gateway` is the single path for an Agent. `packages/llm` is a separate, diagnosis-only gateway from ADR 0002. It predates Agent config and is not wired to `packages/gateway`. Issue #40 moves diagnosis into `packages/gateway` so that one gateway serves every model call. Do not add another provider path.

The budget check and the charge are two separate steps. Concurrent calls can spend more than the daily limit. A reservation taken before the model call is the upgrade path when the daemon runs calls in parallel.

## Daemon local surface

The daemon keeps only health and a local command inbox (**not built**). It listens on port 2602 and binds to 127.0.0.1 by default. The `PORT` environment variable changes the port. No client calls the daemon directly. Keep the bind on localhost.

## Decisions

See `docs/adr/0001-full-scope-for-kiroween.md`, `docs/adr/0002-single-ai-sdk-provider.md` (superseded by `docs/adr/0007-configurable-agents-and-providers.md`), `docs/adr/0003-platform-v2-starts-now.md`, `docs/adr/0004-effect-v4-daemon-on-bun.md`, `docs/adr/0005-event-backbone-nats.md`, `docs/adr/0006-nestjs-api-and-mcp.md` and `docs/adr/0007-configurable-agents-and-providers.md`.
