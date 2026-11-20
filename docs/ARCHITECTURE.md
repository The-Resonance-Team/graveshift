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
| LLM | `packages/llm` | `LlmGateway`: single AI SDK model, retry, timeout, daily budget, prompt redaction. The only place provider calls are made. |
| Exorcist | `packages/fixer` | Patch guard, GitHub App auth, `graveshift/` branches, draft pull requests. No merge call exists. |
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
        -> Exorcist: draft PR (only if a patch generator is wired: not built)
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
| `POST /mcp` | Streamable HTTP MCP endpoint. Requires `Authorization: Bearer <GRAVESHIFT_MCP_TOKEN>`. |

The API listens on 127.0.0.1 by default. Set `HOST` to change the bind address. Set `PORT` to change the port from 3000. Keep the localhost bind unless the MCP bearer token is configured and the endpoint is exposed deliberately.

Structured logging is deferred to the production ticket.

The API uses Zod through Nest's standard-schema pipe. When a route takes input, the route attaches a Zod schema with `@Body({ schema })`, `@Query({ schema })` or `@Param({ schema })`. No business logic, rate limits or SSE were added to the HTTP routes here. MCP is served by the official module at `/mcp`; its bearer token is the only authentication on this surface. Later tickets add the routes for graves and hauntings here.

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

## Daemon local surface

The daemon keeps only health and a local command inbox (**not built**). It listens on port 2602 and binds to 127.0.0.1 by default. The `PORT` environment variable changes the port. No client calls the daemon directly. Keep the bind on localhost.

## Decisions

See `docs/adr/0001-full-scope-for-kiroween.md`, `docs/adr/0002-single-ai-sdk-provider.md`, `docs/adr/0003-platform-v2-starts-now.md`, `docs/adr/0004-effect-v4-daemon-on-bun.md`, `docs/adr/0005-event-backbone-nats.md` and `docs/adr/0006-nestjs-api-and-mcp.md`.
