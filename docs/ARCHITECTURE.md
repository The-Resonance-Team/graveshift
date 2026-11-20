# Architecture

This describes the code as it exists. Items that are not built are marked **not built**.

The v1 daemon is at `apps/_daemon`. It is reference only. The repository does not build it and does not start it. The new daemon at `apps/daemon` is an Effect v4 skeleton on Bun. It has no use cases yet.

## Components

| Component | Path | Role |
| --- | --- | --- |
| API | `apps/api` | NestJS app. The only external surface. Serves `GET /healthz`, the OpenAPI document and the Swagger UI. |
| API contract | `packages/api-contract` | Publishes generated TypeScript types and a version marker from the OpenAPI document. No event envelope. |
| Daemon (v1) | `apps/_daemon` | Reference only. Wires Wraith, Medium, policy, optional fixer and the audit log. Not built and not started. |
| Daemon (v2) | `apps/daemon` | New Effect v4 skeleton on Bun. Serves `GET /healthz` only. |
| Core | `packages/core` | Zod schemas (source of truth), incident state machine, circuit-breaker helper, config loader, `RuntimeSource` contract. |
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
| MCP | `packages/mcp-server` | `graveshift-mcp` over stdio. HTTP transport exists as code only. |
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

The API listens on 127.0.0.1 by default. Set `HOST` to change the bind address. Set `PORT` to change the port from 3000. Keep the localhost bind until authentication ships.

Structured logging is deferred to the production ticket.

The API uses Zod through Nest's standard-schema pipe. When a route takes input, the route attaches a Zod schema with `@Body({ schema })`, `@Query({ schema })` or `@Param({ schema })`. This ticket adds no business logic, authentication, rate limits, MCP or SSE. Later tickets add the routes for graves and hauntings here.

`packages/api-contract` generates its types from the OpenAPI document. It exports the generated types and the `API_CONTRACT_VERSION` marker through `package.json#exports` only. It does not define an event envelope or any domain event type; a later ticket owns the envelope.

## Daemon local surface

The daemon keeps only health and a local command inbox (**not built**). It listens on port 2602 and binds to 127.0.0.1 by default. The `PORT` environment variable changes the port. No client calls the daemon directly. Keep the bind on localhost.

## Decisions

See `docs/adr/0001-full-scope-for-kiroween.md`, `docs/adr/0002-single-ai-sdk-provider.md`, `docs/adr/0003-platform-v2-starts-now.md`, `docs/adr/0004-effect-v4-daemon-on-bun.md` and `docs/adr/0006-nestjs-api-and-mcp.md`.
