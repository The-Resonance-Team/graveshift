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
│   └── daemon/                    # Effect v4 on Bun, health route only
├── packages/
│   ├── agents/                    # Agent config and routing
│   ├── api-contract/              # Generated API types
│   ├── core/                      # Zod schemas, state machine, rule engine
│   ├── events/                    # Event publishing
│   ├── integrations/              # Plugin and Collector contracts
│   ├── patch/                     # Patch generation and guard
│   ├── policy/                    # policy.yaml loader + PolicyEngine (pure, deterministic)
│   ├── redactor/                  # secret/PII redaction (pure) + PBT
│   ├── sources-docker/            # RuntimeSource via docker-socket-proxy (dockerode)
│   ├── sources-k8s/               # RuntimeSource via @kubernetes/client-node
│   ├── metrics/                   # Prometheus PromQL client
│   ├── watcher/                   # Wraith: rules, dedupe, fingerprint
│   ├── diagnoser/                 # Medium: gateway, evidence validation and rules-only fallback
│   ├── fixer/                     # Exorcist: GitHub App client and draft PRs
│   ├── notifier-discord/          # Banshee stub
│   ├── gateway/                   # Single model path for all Agents
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
├── graveshift.config.yaml          # one committed config: boot, agents, policy, fix
├── KIRO_USAGE.md · README.md · LICENSE (Apache-2.0) · NOTICE
├── bunfig.toml · package.json · tsconfig.base.json
├── .oxfmtrc.json · .oxlintrc.json
└── .github/workflows/ci.yml
```

Rules:
- New runtime integration = new `packages/sources-*` implementing `RuntimeSource` and passing the shared contract suite.
- Packages are imported only through `package.json#exports` entry points. No `export *` folder barrels.
- Hooks are defined in `.kiro/hooks/`; their helper scripts live in `scripts/kiro/`.
