# Graveshift

A self-hosted crew of AI Agents that watches a stack, builds a Diagnosis and prepares draft pull requests. It never merges a fix. Privileged runtime actions require a separate human Blessing.

Graveshift v2 uses a NestJS external API, an Effect v4 daemon on Bun, NATS JetStream and PostgreSQL on one host. The dashboard belongs to a separate project. Discord Banshee and push/webhook delivery remain deferred. The v2 records describe a one-project host bootstrap. [ADR 0023](docs/adr/0023-organization-is-the-tenant-root.md) now sets the product model: one deployment serves many Organizations, and each Organization owns its Projects directly.

## How it works

1. A Plugin or Collector publishes a valid, privacy-processed Event envelope. Event and trace identity remain stable.
2. **Wraith** (`packages/watcher`) turns runtime events, logs and Prometheus queries into detections with seven rules, a 10-minute fingerprint dedupe and one haunting (incident) per service. It applies Rule overrides, thresholds and Salt lines, and groups Hauntings.
3. **Medium** (`packages/diagnoser`) builds a Diagnosis through the shared model gateway. It sends redacted context to the selected Agent, checks evidence and retains a deterministic fallback when the model is unavailable, its budget is exhausted or its output remains invalid after one validation retry.
4. A Work item records assignment, routing progress and a durable Fix attempt.
5. **Policy** (`packages/policy`) is pure, deny-first and default deny. It must allow the fix before source or model work.
6. **Exorcist** (`packages/fixer`) reads the real source, verifies a Patch in a sandbox and opens an Exorcism as a draft pull request. It pushes to a `graveshift/` branch and has no merge call. The daemon does not yet generate patches, so no real draft pull request opens today.
7. **Actuator** (`packages/actuator`) is a separate service that runs only approved, HMAC-signed, unexpired, single-use actions.
8. **Banshee** (Discord) is a stub. Notifications and blessings are planned.
9. `apps/api/src/audit` stores credential audit events in PostgreSQL. PostgreSQL owns state and the append-only Audit chain. The API in `apps/api` exposes `graveshift-mcp` read tools to Kiro. Model results need durable audit acknowledgement before use.

`needs_human` means a person fixes the Work item manually. Graveshift runs no fix for this assignment. `needs_agent_<name>` selects that Agent. If its `autoFix` trigger is enabled, the fix starts automatically. If the trigger is disabled, **Fix now** is available. Fix now waits for the attempt outcome. Missing params cause one saved question; an incomplete answer hands the Work item to a person.

See [Architecture](docs/ARCHITECTURE.md), [Security](docs/SECURITY.md), [Glossary](GLOSSARY.md) and the [architecture delivery ledger](docs/reports/2026-11-21-architecture-work.md).

## Local setup

Requires Bun 1.4.4 and Docker. Configure an untracked `.env` using `.env.example`. Set `DATABASE_URL`, two distinct strong internal tokens (`GRAVESHIFT_API_INTERNAL_TOKEN` and `GRAVESHIFT_DAEMON_INTERNAL_TOKEN`), and a separate `GRAVESHIFT_OAUTH_JWT_SECRET`. There is no host-wide project id: the authenticated OAuth client supplies the Project. [ADR 0023](docs/adr/0023-organization-is-the-tenant-root.md) sets the product model: one deployment serves many Organizations, and each Organization owns its Projects directly.

```sh
bun install
docker compose -f deploy/compose/graveshift.compose.yml up -d postgres nats
bun x --bun prisma migrate deploy
bun run --filter @graveshift/api start
```

The API defaults to `127.0.0.1:3000`. It validates its boot settings and YAML before traffic, then connects to PostgreSQL. `GET /healthz` reports process health. `GET /docs` serves the generated route documentation.

The support NATS server has JetStream enabled. Set `GRAVESHIFT_NATS_URL` for both processes. The daemon creates or validates its stream and durable consumer. Configure Agent keys, gateway prices and budget, GitHub App installation credentials, and per-repository verification commands before starting the daemon:

```sh
bun run --filter @graveshift/daemon start
```

The daemon defaults to loopback port 2602. Private calls use two distinct internal tokens: the daemon presents `GRAVESHIFT_API_INTERNAL_TOKEN` to the API, and the API presents `GRAVESHIFT_DAEMON_INTERNAL_TOKEN` to the daemon. Do not expose the daemon to clients. [Daemon integration](apps/daemon/INTEGRATION.md) lists its exact settings and private contracts.

Source verification uses the macOS sandbox or bubblewrap on Linux. It blocks publication when isolation, configured commands or source verification are unavailable. A real deployment needs explicit provider prices, GitHub installation access and check commands. The example config intentionally disables model spending and automatic fixes.

The support Compose file also contains read-only Docker access, Prometheus and the separate actuator. The actuator needs its own HMAC secret and the private API connection. The [Haunted Candy Shop](docs/DEMO.md) remains a deliberate fault-injection example. Kubernetes manifests and the Kiro Power remain scaffolds.

## Configuration

See the root `graveshift.config.yaml` for the one committed config. It holds the `boot`, `agents`, `policy` and `fix` blocks. Each Agent names its model, provider and key environment variable. No secret value is stored in the file. See `.env.example` for the key names.

Agent and policy config live in the one committed root `graveshift.config.yaml`. The file is validated once at boot. A change requires restart. Keys stay only in the environment named by `apiKeyEnv`.

Each Agent has an `autoFix` setting. Client entries replace whole system Agents by name. The effective set must have unique slugs and valid escalation targets. The one config endpoint is `GET /api/config/export` with scope `config:export`. It returns the validated config and writes one audit entry. No config write route exists today. See [ADR 0015](docs/adr/0015-one-config-file-at-boot.md).

Credentials are named, scoped, revocable PostgreSQL records. Their values are returned once and never stored. `POST /api/oauth/token` exchanges a registered client's credentials for a management JWT. `POST /api/credentials` creates an MCP or Plugin Credential. `POST /api/events` accepts authorized Plugin telemetry. Cold and warm requests use the same throttle identity rule.

## MCP

```text
.kiro/       steering, specs, hooks, agents and MCP settings
apps/        api (NestJS API and MCP), daemon (Effect v4 skeleton)
packages/    actuator, agents, api-contract, core, diagnoser, events, fixer, gateway,
             integrations, metrics, notifier-discord, patch, policy,
             redactor, sources-docker, sources-k8s, watcher, work
deploy/      compose (working), k8s base and kind (scaffold), helm (scaffold)
examples/    the haunted candy shop demo app
powers/      the Graveshift Kiro Power scaffold
scripts/     guard scripts used by Kiro hooks
```

One `/mcp` endpoint serves nine tools, two prompts, Autopsy and the poll-only Events extension. The HTTP endpoint requires an issued MCP Credential. Shared permission facts cover modern discovery, Event scopes and older-client compatibility. Proposals are read-only and do not execute a fix.

The stdio launcher uses the same validated runtime config and database, and trusts its local process:

```sh
bun run --filter @graveshift/api start:stdio
```

The Kiro config in `powers/graveshift/mcp.json` inherits the launcher's environment. Set secrets in that environment; keep them out of the checked-in Power config.

## Verification

```sh
bun run verify
bun run generate:check
bun run migrate:drift:check
bun run test:database
```

The root gate checks formatting, lint, types, test types and tests. Formatting precedes lint. Contract generation reads the actual decorated routes without booting runtime providers, loading YAML or inventing secrets.

Database tests create a unique Docker Postgres instance with no shared volumes, apply the migration, run the suite and remove the instance. The fixture guard refuses another database. Database tests are opt-in and remain outside CI.

The API in `apps/api` serves `graveshift-mcp` through the official `@nestjs/mcp` module (v0.0.4). It exposes nine tools (`list_services`, `list_incidents`, `get_incident`, `get_diagnosis`, `get_audit_log`, `verify_audit_chain`, `propose_fix`, `tail_logs`, `query_metric`), two prompts (`triage_incident`, `write_postmortem`), the Autopsy resource at `graveshift://incidents/{id}/postmortem`, and the Beta Events poll extension. Every reply passes through the redactor. `propose_fix` only asks the policy engine and never executes an action.

The merged initial migration is immutable. A frozen historical schema describes it, and `bun run migrate:generate` writes only the current architecture follow-up from that schema to the runtime schema plus `prisma/append-only.sql`. The drift check verifies the baseline and exact follow-up SQL. Docker tests replay both migrations. A later migration must extend the registered history; merged migration files stay unchanged.

Tests use recorded model/GitHub responses and controlled broker/runtime adapters. No test needs production credentials. See the delivery ledger for exact verified results and retained limits.

## Repository

```text
apps/api/       external access and durable operations
apps/daemon/    Effect orchestration, private commands and reads
packages/       pure contracts and model, event, source and execution modules
prisma/         durable schema, initial migration and append-only enforcement
deploy/         support Compose and Kubernetes scaffolds
examples/       fault-injection demo
.kiro/          steering, specs, hooks and agent configuration
powers/         local Kiro Power scaffold
```

The API reads its boot config from the environment. `GRAVESHIFT_OAUTH_JWT_SECRET` has no default and must be at least 32 characters. OAuth clients are registered in PostgreSQL with an Organization, a Project and scopes; there is no boot registry of clients. `POST /api/oauth/token` exchanges a registered client's credentials for a short-lived token. `GRAVESHIFT_OAUTH_ISSUER` and `GRAVESHIFT_OAUTH_AUDIENCE` set the token claims that the API checks.

`GRAVESHIFT_CREDENTIAL_TTL_SECONDS` and `GRAVESHIFT_CREDENTIAL_MAX_TTL_SECONDS` bound issued credential lifetime. PostgreSQL stores credential hashes and the append-only, hash-chained audit log. Credential creation, revocation and expiry events share a transaction with the credential write. `GRAVESHIFT_EVENT_MAX_BYTES`, `GRAVESHIFT_EVENT_RATE_LIMIT` and `GRAVESHIFT_EVENT_RATE_TTL_MS` bound the event ingest route. `GRAVESHIFT_NATS_URL` enables NATS publish; without it, publish fails closed with 503. See `.env.example` for the full list.

The public `@graveshift/core` and `@graveshift/events` packages contain the state and event contracts. Build both with `bun run build:contracts`; publish them from their package directories when a release is approved. This branch does not publish packages.

## Guides

- [Sentry SDK guide](docs/guides/sentry-sdks.md)

## Roadmap

Open work is tracked in issues #11 to #16. Open platform work is tracked by [issue #18](https://github.com/The-Resonance-Team/graveshift/issues/18). The earlier hackathon scope is superseded by the v2 ADRs. [KIRO_USAGE.md](KIRO_USAGE.md) records the earlier development work.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party code and templates will be disclosed in the ADRs under `docs/adr/` as they are added.
