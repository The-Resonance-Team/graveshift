# Demo: Haunted Candy Shop

`examples/haunted-candy-shop` is a fault-injectable app: an `api` (port 2600), a `worker` (port 2601) and Postgres. Graveshift watches it through the read-only docker-socket-proxy and Prometheus.

Themed names are UI copy only. In code and APIs they are `incident`, `approval` and `service`.

## Run it

Secrets come from your shell or an untracked `.env`; nothing is committed. An empty token makes the matching endpoint refuse every request.

```sh
export POSTGRES_PASSWORD=...   # database password
export HAUNT_TOKEN=...         # allows POST /__haunt
export OWNER_TOKEN=...         # allows POST /__reset (owner only)

# demo app only
docker compose -f deploy/compose/demo.compose.yml up -d --build

# demo app plus Graveshift (daemon, read-only socket proxy, separate actuator, Prometheus)
docker compose -f deploy/compose/graveshift.compose.yml -f deploy/compose/demo.compose.yml up -d --build
```

Ports bind to `127.0.0.1` only. The daemon reaches Docker only through `socket-proxy` (containers, events, logs, info; `POST=0`). `docker.sock` is mounted into the two proxies and nowhere else. Only the `actuator` can write, through `socket-proxy-actuator`, which allows container restarts and nothing else.

The `daemon` and `actuator` images build from `deploy/compose/bun.Dockerfile`. The actuator exits at startup unless `ACTUATOR_HMAC_SECRET` has 32 or more characters, so set it before `up`:

```sh
export ACTUATOR_HMAC_SECRET=$(openssl rand -hex 32)
```

The daemon API is on `127.0.0.1:2602`. The demo api and worker publish ports 2600 and 2601 on `127.0.0.1`; if another app holds port 2600, run the curl commands below from inside the Compose network (`docker compose exec`).

## Watch the Haunting

1. Open the dashboard: `cd apps/dashboard && DAEMON_URL=http://127.0.0.1:2602 bun run build && bun run start`, then visit `http://localhost:2604`. The Haunt panel can inject a scenario with a 30 s cooldown (the daemon needs `HAUNT_TOKEN`).
2. Inject `null-candy` (below). Within seconds the api grave shows a Haunting, and the timeline moves from Wraith to Medium. Diagnosis uses one configured AI SDK model (`llm` in `graveshift.config.yaml`, key in `OPENAI_COMPATIBLE_API_KEY`). If the model is unavailable or its output is invalid, the diagnosis comes from the rules-only fallback and says so.
3. Check the audit chain: `curl localhost:2602/api/audit/verify` returns `{"ok":true,"length":N}`.

What does not happen yet: no draft pull request opens, because no patch generator is wired; no Discord message is sent; the daemon has no approval endpoint, so the `memory-leech` restart cannot be blessed. The actuator rejects an unsigned request with 403, which you can check with `curl -X POST localhost:2603/actions` from inside the network.

## Observability

- `GET /healthz`: 200 when the database answers, 503 otherwise.
- `GET /metrics`: `http_requests_total{status}`, `http_request_duration_seconds` (histogram), `process_resident_memory_bytes`. The worker also exposes `jobs_processed_total`.
- Prometheus scrapes jobs `demo-api`, `demo-worker` and `graveshift`.

## Scenarios

Inject with `POST /__haunt` and the header `x-haunt-token: $HAUNT_TOKEN` (or `Authorization: Bearer ...`). A bad token returns 401, an unknown scenario 400.

```sh
curl -X POST localhost:2600/__haunt -H "x-haunt-token: $HAUNT_TOKEN" -d '{"scenario":"null-candy"}'
```

| Scenario | Target | Fault | Expected signal | Expected outcome |
| --- | --- | --- | --- | --- |
| `null-candy` | api | candy 1 gets a `NULL` price; `GET /candies/1` throws a `TypeError` (500) | `log.error-burst`, `metric.5xx-rate` | diagnosis `code_bug`; the draft PR with a null guard is the target, not yet produced |
| `memory-leech` | worker (port 2601) | the worker keeps 8 MB per second until the 128 MB limit kills it | `runtime.oom`, `runtime.restart-loop` | approval, then restart, plus a draft PR removing the leak |
| `wrong-potion` | api | the api switches to a stale `DATABASE_URL_STALE` | `log.error-burst`, `runtime.unhealthy` | draft PR reverting the config |
| `slow-curse` (stretch) | api | `GET /candies/search` loses its index and takes about 1.8 s | `metric.p95-latency` | draft PR adding the index |
| `image-ghost` (stretch, Kubernetes) | deploy | bad image tag, applied by deploy tooling, the endpoint only acknowledges it | `k8s.image-pull` | propose a rollback image, needs approval |

`image-ghost` on kind: `kubectl -n candy-shop set image deployment/api api=haunted-candy-shop:ghost`.

## Reset

`POST /__reset` with `x-haunt-token: $OWNER_TOKEN` restores prices, the index and the database connection on that process, and clears the leak on the worker. The `HAUNT_TOKEN` cannot reset. Reset both processes:

```sh
curl -X POST localhost:2600/__reset -H "x-haunt-token: $OWNER_TOKEN"
curl -X POST localhost:2601/__reset -H "x-haunt-token: $OWNER_TOKEN"
```

Closing demo PRs and archiving incidents is not implemented, and the daemon keeps incidents in memory, so `docker compose restart graveshift` clears the graveyard (the audit log stays). A `bun run demo:reset` wrapper is not provided. A scheduled daily reset belongs to the public demo (issue #14).

## Kind (Kubernetes)

Not runnable yet. `deploy/kind/bootstrap.sh` is a placeholder, `deploy/k8s` has no Deployments and no kind overlay, and `kind` was not available when this was written. The `image-ghost` command above applies only after that work lands (issue #14). Until then use Compose.

## Tear down

```sh
docker compose -f deploy/compose/graveshift.compose.yml -f deploy/compose/demo.compose.yml down -v
```

## Verified locally

Run on Docker with the demo compose file: `null-candy` (500 then 200 after reset), `slow-curse` (1.8 s then 9 ms), `wrong-potion` (503 then 200) and `memory-leech` (Docker emitted `oom` and `die` with exit code 137). The Docker source, reading through the proxy, turned those events into `oom` and `restart` signals. Kubernetes behavior is covered by fixture tests only; no cluster was available. The daemon run on Docker produced SSE within about 5 s of a haunt, reached `diagnosed` with category `code_bug`, and the audit chain verified. `docs/qa/coverage-matrix.md` lists the 21 dashboard checks.
