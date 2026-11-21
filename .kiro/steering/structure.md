---
inclusion: always
---
# Structure

Monorepo layout:

```
graveshift/
├── .kiro/                         # NEVER gitignore (except settings/mcp.json)
├── apps/
│   ├── api/                       # NestJS API: /healthz, /api/rules/validate, MCP /mcp and stdio launcher
│   ├── dashboard/                 # Next.js graveyard UI
│   └── daemon/                    # main process: watcher→diagnoser→fixer→notifier, HTTP API (Fastify) + SSE
├── packages/
│   ├── core/                      # Zod schemas, types, state machine, event bus, config loader
│   ├── policy/                    # policy.yaml loader + PolicyEngine (pure, deterministic)
│   ├── redactor/                  # secret/PII redaction (pure) + PBT
│   ├── sources-docker/            # RuntimeSource via docker-socket-proxy (dockerode)
│   ├── sources-k8s/               # RuntimeSource via @kubernetes/client-node
│   ├── metrics/                   # Prometheus PromQL client
│   ├── watcher/                   # Wraith: rules, dedupe, fingerprint
│   ├── diagnoser/                 # Medium: context builder, prompts, evidence validator
│   ├── fixer/                     # Exorcist: patch generation, path guard, GitHub App client, draft PRs
│   ├── notifier-discord/          # Banshee: discord.js bot, embeds, buttons, slash commands
│   ├── llm/                       # LlmGateway: diagnosis-only provider path + fallback + budget
│   ├── gateway/                   # single Agent model-call path: redaction, budget, audit, retry, rules-only
│   ├── store/                     # Drizzle ORM (SQLite default / Postgres), audit log
│   └── actuator/                  # separate deployable: executes approved signed actions only
├── examples/haunted-candy-shop/   # fault-injectable demo app (api + worker + postgres)
├── deploy/
│   ├── compose/                   # graveshift.compose.yml, demo.compose.yml, prometheus.yml
│   ├── k8s/                       # kustomize base + overlays/kind, rbac.yaml, networkpolicy.yaml
│   ├── kind/                      # kind-config.yaml, bootstrap.sh
│   └── helm/graveshift/           # stretch
├── powers/graveshift/             # Kiro Power (stretch)
├── scripts/kiro/                  # guard-shell.mjs, secret-scan.mjs (used by hooks)
├── docs/                          # ARCHITECTURE.md, SECURITY.md, DECISIONS.md, DEMO.md
├── policy.example.yaml · graveshift.config.example.yaml
├── KIRO_USAGE.md · README.md · LICENSE (Apache-2.0) · NOTICE
├── bunfig.toml · package.json · tsconfig.base.json
├── .oxfmtrc.json · .oxlintrc.json
└── .github/workflows/ci.yml
```

Rules:
- New runtime integration = new `packages/sources-*` implementing `RuntimeSource` and passing the shared contract suite.
- Packages are imported only through `package.json#exports` entry points. No `export *` folder barrels.
- Hooks are defined in `.kiro/hooks/`; their helper scripts live in `scripts/kiro/`.
