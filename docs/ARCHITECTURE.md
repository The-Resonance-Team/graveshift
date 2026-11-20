# Architecture

This describes the code as it exists. Items that are not built are marked **not built**.

## Components

| Component | Path | Role |
| --- | --- | --- |
| Daemon | `apps/daemon` | Wires watcher, diagnoser, policy, optional fixer and the audit log. Serves an HTTP API and Server-Sent Events (SSE) with `Bun.serve`. |
| Dashboard | `apps/dashboard` | Next.js graveyard UI. Proxies `/api/*` to the daemon. |
| Core | `packages/core` | Zod schemas (source of truth), incident state machine, circuit-breaker helper, config loader, `RuntimeSource` contract. |
| Store | `packages/store` | Hash-chained, append-only audit log on `bun:sqlite` through Drizzle. |
| Policy | `packages/policy` | YAML loader and `decide()`. Pure and deterministic. |
| Redactor | `packages/redactor` | Twelve ordered detectors, idempotent. |
| Sources | `packages/sources-docker`, `packages/sources-k8s` | `RuntimeSource` implementations. Docker through the socket proxy; Kubernetes through `@kubernetes/client-node`, read-only. |
| Metrics | `packages/metrics` | Prometheus instant-query client and the watcher queries. |
| Wraith | `packages/watcher` | Rules, fingerprint dedupe, per-service incident, Salt-line silences, PromQL poller. |
| Medium | `packages/diagnoser` | Context builder, untrusted wrapping, evidence validation, rules-only fallback. |
| LLM | `packages/llm` | `LlmGateway`: provider chain, retry, timeout, daily budget, prompt redaction. The only place provider calls are made. |
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

`deploy/compose/graveshift.compose.yml` runs:

- `graveshift` (daemon, port `127.0.0.1:2602`, read-only root filesystem, all capabilities dropped).
- `socket-proxy`: `tecnativa/docker-socket-proxy`, read-only (`POST=0`), the only Docker path for the daemon.
- `socket-proxy-actuator`: allows container restart only, on an internal network used by the actuator.
- `actuator` (port 2603, not published). It exits at startup if `ACTUATOR_HMAC_SECRET` is shorter than 32 characters.
- `prometheus`, scraping the demo app jobs.

`docker.sock` is mounted into the two proxies and nowhere else.

## Kubernetes mode

`deploy/k8s` holds RBAC and a network policy only. The reader ClusterRole allows get/list/watch (including `pods/log`). The actuator has a namespaced Role limited to patching `api` and `worker` deployments and scaling `worker`. The network policy is a skeleton that allows all egress. There are no Deployments, no kind overlay and no working bootstrap script: **not built** (issue #14). RBAC changes require a change to `.kiro/specs/k8s-deploy`.

## Daemon API

All routes are `GET` unless noted. There are no approval or silence endpoints yet.

| Route | Returns |
| --- | --- |
| `/healthz` | `{status: "ok"}` |
| `/api/mode` | policy mode, effective mode, warning |
| `/api/graveyard` | services with health and open incident |
| `/api/incidents`, `/api/incidents/:id`, `/timeline`, `/pr` | incident views |
| `/api/events` | SSE: `hello`, `incident`, `timeline`, `ping` |
| `/api/audit?afterSeq=&limit=` | audit entries, limit 1 to 100 |
| `/api/audit/verify` | chain verification result |
| `POST /api/haunt` | demo fault injection; needs `HAUNT_TOKEN` to be configured and is limited to one per 30 s |

The daemon has no authentication. Bind it to localhost, as the Compose file does.

## Decisions

See `docs/DECISIONS.md` and `docs/adr/0001-full-scope-for-kiroween.md`.
