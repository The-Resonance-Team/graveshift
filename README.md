# Graveshift

A haunted on-call crew of AI agents that works the graveyard shift so you do not have to.

> **Status (hackathon build):** the daemon, dashboard, runtime sources, policy engine, redactor, diagnoser, fixer, actuator, audit log and MCP server are implemented and tested. The Compose stack runs end to end on one machine. Discord (the Banshee), the Kubernetes manifests and bootstrap, and a public demo are **not** done. See [Not done yet](#not-done-yet).

## Problem

Small teams have no on-call site reliability engineer. Faults appear at 3 AM. Commercial AI site reliability tools are expensive and target large enterprises. Graveshift is an open-source, self-hosted crew that watches a stack and prepares draft pull requests for fixes. It never merges and never changes production without a human blessing.

## Who it is for

Indie developers, teams of one to ten developers, students with deployed projects and small teams on a virtual private server.

## How it works

1. **Wraith** (`packages/watcher`) turns runtime events, logs and Prometheus queries into detections with seven rules, a 10-minute fingerprint dedupe and one haunting (incident) per service.
2. **Medium** (`packages/diagnoser`) builds a diagnosis from logs and signals. Logs are wrapped as untrusted, evidence is validated, and one retry then `needs_human` applies. Model calls go only through `packages/llm` (one model through the Vercel AI SDK OpenAI-compatible provider; rules-only when the model is unavailable or its output is invalid).
3. **Policy** (`packages/policy`) decides every action. It is pure, deny-first and default deny.
4. **Exorcist** (`packages/fixer`) pushes to a `graveshift/` branch and opens a draft pull request. It has no merge call. The daemon does not yet generate patches, so no real draft pull request opens today.
5. **Actuator** (`packages/actuator`) is a separate service that runs only approved, HMAC-signed, unexpired, single-use actions.
6. **Banshee** (Discord) is a stub. Notifications go to a no-op notifier and blessings cannot be given yet.
7. Everything is written to a hash-chained audit log (`packages/store`). The dashboard shows the graveyard, and `graveshift-mcp` exposes read tools to Kiro.

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

The daemon listens on `127.0.0.1:2602`. Start the dashboard against it:

```sh
cd apps/dashboard
DAEMON_URL=http://127.0.0.1:2602 bun run build
bun run start        # http://localhost:2604
```

`DAEMON_URL` is baked in at build time. Without an LLM config the daemon still runs and writes rules-only diagnoses. To use a model, copy `graveshift.config.example.yaml`, set `llm.model` and `llm.baseUrl`, and put the key in `OPENAI_COMPATIBLE_API_KEY` (see `.env.example`).

Inject a fault and reset it: see [docs/DEMO.md](docs/DEMO.md).

## Kubernetes

The Kubernetes runtime source (`packages/sources-k8s`) is tested against fixtures only. The kustomize base has RBAC and a network policy but no Deployments, the kind overlay does not exist, and `deploy/kind/bootstrap.sh` is a placeholder. A kind or k3s run is not possible yet (issue #14).

## Safety model

- Production stays read-only for the agents. Fixes are draft pull requests only.
- Runtime actions need a policy rule and a human blessing. In `act` mode a runtime action is still `require_approval`.
- Every string sent to a language model, log line, audit payload or MCP response passes through the redactor.
- A deterministic policy engine decides actions. Model output cannot grant permission.
- Every decision is written to a hash-chained, append-only audit log.
- The circuit breaker disables auto-actions for a service when a haunting reopens within 10 minutes of an action.

## Not done yet

| Item | Issue |
| --- | --- |
| Discord Banshee bot, blessings and banishments, so no approval endpoint exists in the daemon | #13 |
| Kubernetes Deployments, kind overlay, working `bootstrap.sh`, public k3s demo with daily reset | #14 |
| Patch generation, so `openFix` is unset and no draft pull request opens | none yet |
| Provider keys, GitHub App and Discord application | #12 |
| Demo video and Devpost submission (human only) | #15 |
| Kiro usage screenshots and final write-up | #16 |

## Configuration

See `policy.example.yaml` and `graveshift.config.example.yaml`. No secrets are committed.

## Built with Kiro

The `.kiro` directory holds steering, specs, hooks and agents. See [KIRO_USAGE.md](KIRO_USAGE.md).

## Repository layout

```text
.kiro/       steering, specs, hooks, agents and MCP settings
apps/        daemon (HTTP API and SSE) and dashboard (Next.js)
packages/    core, store, policy, redactor, metrics, sources-docker, sources-k8s,
             watcher, llm, diagnoser, fixer, actuator, mcp-server, notifier-discord (stub)
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

## MCP server

`packages/mcp-server` is `graveshift-mcp`: read tools for services, incidents, diagnoses and the audit log, plus `propose_fix`, which only asks the policy engine and never executes. It also serves the `triage-incident` and `write-postmortem` prompts and an Autopsy resource at `graveshift://incidents/{id}/postmortem`. Run it over stdio with `DAEMON_URL=http://127.0.0.1:2602 POLICY_PATH=policy.example.yaml bun run --cwd packages/mcp-server start:stdio`. The HTTP transport (bearer `GRAVESHIFT_MCP_TOKEN`) exists as code and has not been deployed. The local `.kiro/settings/mcp.json` entry may still be disabled; enable it yourself.

## Roadmap

Open work is tracked in issues #11 to #16.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party code and templates will be disclosed in `docs/DECISIONS.md` as they are added.
