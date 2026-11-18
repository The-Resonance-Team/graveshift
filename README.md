# Graveshift

A haunted on-call crew of AI agents that works the graveyard shift so you do not have to.

> **Repository status: scaffold.** This commit holds the monorepo skeleton, toolchain, `.kiro` directory and documentation stubs. Feature code, a runnable demo and deployment manifests arrive in later phases. The gates below already pass.

## Problem

Small teams have no on-call site reliability engineer. Faults appear at 3 AM. Commercial AI site reliability tools are expensive and target large enterprises. Graveshift is an open-source, self-hosted crew that watches a stack and opens draft pull requests for fixes. It never writes to production directly.

## Who it is for

Indie developers, teams of one to ten developers, students with deployed projects and small teams on a virtual private server.

## How it works (planned)

The Wraith watches logs, events and metrics. The Medium builds a diagnosis from signals and git history. The Exorcist opens a draft pull request. The Banshee notifies Discord and waits for a human blessing before any runtime action. A deterministic policy engine decides every action. All decisions go to an append-only audit log.

## Quick start

Not available yet. The scaffold does not contain a runnable application.

Planned commands:

```sh
# Docker Compose
docker compose -f deploy/compose/graveshift.compose.yml up -d

# Kubernetes (kind)
bash deploy/kind/bootstrap.sh
```

## Safety model (planned)

- Production stays read-only for the agents. Fixes are draft pull requests only.
- Runtime actions need a policy rule and a human blessing.
- Every string sent to a language model passes through the redactor.
- A deterministic policy engine decides actions. Model output cannot grant permission.
- Every decision is written to a hash-chained audit log.

## Configuration

See `policy.example.yaml` and `graveshift.config.example.yaml`. No secrets are committed.

## Built with Kiro

The `.kiro` directory holds steering, specs, hooks and agents. See [KIRO_USAGE.md](KIRO_USAGE.md).

## Repository layout

```text
.kiro/       steering, specs, hooks, agents and MCP settings
apps/        daemon and dashboard
packages/    core, policy, redactor, runtime sources and the ghost personas
deploy/      compose, kubernetes, kind and helm scaffolds
examples/    the haunted candy shop demo app
powers/      the Graveshift Kiro Power scaffold
scripts/     development guard scripts
```

## Development

Requires Bun 1.4.4.

```sh
bun install
bun run verify
```

The verification order is format check, lint, typecheck, type-checked tests, then tests. Formatting runs before linting because formatting expands compact source and can expose line-length findings.

## Roadmap

See the wayfinder map in the repository issues. It lists the decisions that remain before feature implementation.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party code and templates will be disclosed in `docs/DECISIONS.md` as they are added.
