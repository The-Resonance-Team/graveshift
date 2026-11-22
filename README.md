# Graveshift

A haunted on-call crew of AI agents that works the graveyard shift so you do not have to.

> **Status.** The daemon in `apps/daemon` is an Effect v4 skeleton on Bun. It serves a health route. The incident flow, Discord, Kubernetes deployment and public demo are planned. See [Not done yet](#not-done-yet).

## Problem

Small teams have no on-call site reliability engineer. Faults appear at 3 AM. Commercial AI site reliability tools are expensive and target large enterprises. Graveshift is an open-source, self-hosted crew that watches a stack and prepares draft pull requests for fixes. It never merges and never changes production without a human blessing.

## Who it is for

Indie developers, teams of one to ten developers, students with deployed projects and small teams on a virtual private server.

## How it works

1. **Wraith** (`packages/watcher`) turns runtime events, logs and Prometheus queries into detections with seven rules, a 10-minute fingerprint dedupe and one haunting (incident) per service.
2. **Medium** (`packages/diagnoser`) builds a diagnosis from logs and signals. It sends redacted context to the selected Agent through `packages/gateway`. It checks evidence and uses a rules-only diagnosis when the model is unavailable, its budget is exhausted or its output remains invalid after one validation retry.
3. **Policy** (`packages/policy`) decides every action. It is pure, deny-first and default deny.
4. **Exorcist** (`packages/fixer`) pushes to a `graveshift/` branch and opens a draft pull request. It has no merge call. The daemon does not yet generate patches, so no real draft pull request opens today.
5. **Actuator** (`packages/actuator`) is a separate service that runs only approved, HMAC-signed, unexpired, single-use actions.
6. **Banshee** (Discord) is a stub. Notifications and blessings are planned.
7. `apps/api/src/audit` stores credential audit events in PostgreSQL. The API in `apps/api` exposes `graveshift-mcp` read tools to Kiro.

The packages implement these steps. The daemon still needs to connect them.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SECURITY.md](docs/SECURITY.md) and [GLOSSARY.md](GLOSSARY.md).

## Quick start (Docker Compose)

Needs Bun 1.4.4 and Docker. Secrets come from your shell or an untracked `.env`.

```sh
bun install

export POSTGRES_PASSWORD=...        # demo database
export HAUNT_TOKEN=...              # allows fault injection on the demo app
export OWNER_TOKEN=...              # allows resetting the demo app
export ACTUATOR_HMAC_SECRET=$(openssl rand -hex 32)   # actuator refuses to start without 32+ characters

docker compose -f deploy/compose/graveshift.compose.yml -f deploy/compose/demo.compose.yml up -d --build
```

The new daemon serves `GET /healthz` on port 2602 and binds to 127.0.0.1 by default. Set `PORT` to change the port. Compose does not start the daemon. No dashboard ships in this branch; a Next.js UI will be scaffolded separately.

Inject a fault and reset it: see [docs/DEMO.md](docs/DEMO.md).

## Kubernetes

The Kubernetes runtime source (`packages/sources-k8s`) is tested against fixtures only. The kustomize base has RBAC and a network policy but no Deployments, the kind overlay does not exist, and `deploy/kind/bootstrap.sh` is a placeholder. A kind or k3s run is not possible yet (issue #14).

## Safety model

- Production stays read-only for the agents. Fixes are draft pull requests only.
- Runtime actions need a policy rule and a human blessing. In `act` mode a runtime action is still `require_approval`.
- Every string sent to a language model, log line, audit payload or MCP response passes through the redactor.
- A deterministic policy engine decides actions. Model output cannot grant permission.
- Audit entries are append-only and hash-chained. Daemon audit wiring is planned.
- The circuit breaker disables auto-actions for a service when a haunting reopens within 10 minutes of an action.

## Not done yet

| Item | Issue |
| --- | --- |
| Discord Banshee bot, blessings and banishments, so no approval endpoint exists in the daemon | #13 |
| Kubernetes Deployments, kind overlay, working `bootstrap.sh`, public k3s demo with daily reset | #14 |
| Daemon and API wiring for model calls and draft pull requests | none yet |
| Provider keys, GitHub App and Discord application | #12 |
| Demo video and Devpost submission (human only) | #15 |
| Kiro usage screenshots and final write-up | #16 |

## Configuration

See the root `graveshift.config.yaml` for the one committed config. It holds the `boot`, `agents`, `policy` and `fix` blocks. Each Agent names its model, provider and key environment variable. No secret value is stored in the file. See `.env.example` for the key names.

## Built with Kiro

The `.kiro` directory holds steering, specs, hooks and agents. See [KIRO_USAGE.md](KIRO_USAGE.md).

## Repository layout

```text
.kiro/       steering, specs, hooks, agents and MCP settings
apps/        api (NestJS API and MCP), daemon (Effect v4 skeleton)
packages/    actuator, agents, api-contract, core, diagnoser, events, fixer, gateway,
             integrations, metrics, notifier-discord, patch, policy,
             redactor, sources-docker, sources-k8s, watcher
deploy/      compose (working), k8s base and kind (scaffold), helm (scaffold)
examples/    the haunted candy shop demo app
powers/      the Graveshift Kiro Power scaffold
scripts/     guard scripts used by Kiro hooks
```

## Development

Requires Bun 1.4.4.

```sh
bun install
bun run verify
```

`bun run verify` runs the format check, lint, typecheck, type-checked tests, then tests. Formatting runs before linting because formatting expands compact source and can expose line-length findings.

## Prisma migrations

CI checks schema drift without a database by comparing the generated schema SQL with the committed migration SQL. This check supports additive migrations only. When a second or destructive migration is added, change to a shadow-database drift check and ask the coordinator to approve a CI Postgres service or an external test database.

`DATABASE_URL` in `.env.example` and the API default use the same local placeholder credentials as the Postgres service in Compose. Start Postgres with `docker compose -f deploy/compose/graveshift.compose.yml up -d postgres`. For the local shadow-database check, set `SHADOW_DATABASE_URL` to a separate, empty database using the same credentials; create it with `docker compose -f deploy/compose/graveshift.compose.yml exec postgres createdb -U graveshift graveshift_shadow`. Then run `bun run migrate:drift:local`.

## MCP server

The API in `apps/api` serves `graveshift-mcp` through the official `@nestjs/mcp` module (v0.0.4). It exposes nine tools (`list_services`, `list_incidents`, `get_incident`, `get_diagnosis`, `get_audit_log`, `verify_audit_chain`, `propose_fix`, `tail_logs`, `query_metric`), two prompts (`triage_incident`, `write_postmortem`), the Autopsy resource at `graveshift://incidents/{id}/postmortem`, and the Beta Events poll extension. Every reply passes through the redactor. `propose_fix` only asks the policy engine and never executes an action.

The Streamable HTTP endpoint is `/mcp` on the API. It requires an unexpired MCP token issued by `POST /api/credentials` with kind `mcp`. The shared credential component in `apps/api/src/auth` verifies the token; no static token is read. The module keeps no sessions and serves 2025-era clients on the same endpoint. Kiro can also launch it over stdio from a standalone application context with `bun run --filter @graveshift/api start:stdio`; stdio has no authentication by design and trusts the local process. The stdio launcher still builds the same `AppModule`, so `GRAVESHIFT_OAUTH_JWT_SECRET` (at least 32 characters) must be set at boot; `powers/graveshift/mcp.json` carries a placeholder to replace with a strong local value.

The v2 daemon serves only `/healthz`, so the read tools return empty results today. No daemon data is invented. Tool logic lives in injectable providers in `apps/api/src/mcp/`. A test connects an official in-memory MCP client with `era: 'legacy'` to prove a `2025-06-18` client can list tools and call one.

## API credential configuration

To send telemetry from an official Sentry SDK, see [the Sentry SDK guide](docs/guides/sentry-sdks.md).

The API reads its boot config from the environment. `GRAVESHIFT_OAUTH_JWT_SECRET` has no default and must be at least 32 characters. `GRAVESHIFT_OAUTH_CLIENTS` is a JSON map of client id to `{ "secret", "projectId", "scopes" }`; `POST /api/oauth/token` exchanges those values for a short-lived token. `GRAVESHIFT_OAUTH_ISSUER` and `GRAVESHIFT_OAUTH_AUDIENCE` set the token claims that the API checks.

`GRAVESHIFT_CREDENTIAL_TTL_SECONDS` and `GRAVESHIFT_CREDENTIAL_MAX_TTL_SECONDS` bound issued credential lifetime. PostgreSQL stores credential hashes and the append-only, hash-chained audit log. Credential creation, revocation and expiry events share a transaction with the credential write. `GRAVESHIFT_EVENT_MAX_BYTES`, `GRAVESHIFT_EVENT_RATE_LIMIT` and `GRAVESHIFT_EVENT_RATE_TTL_MS` bound the event ingest route. `GRAVESHIFT_NATS_URL` enables NATS publish; without it, publish fails closed with 503. See `.env.example` for the full list.

The public `@graveshift/core` and `@graveshift/events` packages contain the state and event contracts. Build both with `bun run build:contracts`; publish them from their package directories when a release is approved. This branch does not publish packages.

## Roadmap

Open work is tracked in issues #11 to #16.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party code and templates will be disclosed in the ADRs under `docs/adr/` as they are added.
