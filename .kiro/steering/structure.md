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
│   └── daemon/                    # Effect v4: private commands, queue intake and orchestration
├── packages/
│   ├── agents/                    # Agent config and routing
│   ├── api-contract/              # Generated API types
│   ├── config/                    # One GraveshiftConfigSchema and boot loader
│   ├── core/                      # Zod schemas, state machine, rule engine
│   ├── events/                    # Event publishing
│   ├── integrations/              # Plugin and Collector contracts
│   ├── patch/                     # Patch generation and guard
│   ├── policy/                    # policy.yaml loader + PolicyEngine (pure, deterministic)
│   ├── redactor/                  # secret/PII redaction (pure) + PBT
│   ├── sources-docker/            # Collector through the read-only socket proxy
│   ├── sources-k8s/               # Collector through @kubernetes/client-node
│   ├── metrics/                   # Prometheus PromQL client
│   ├── watcher/                   # Wraith: rules, dedupe, fingerprint
│   ├── diagnoser/                 # Medium: gateway, evidence validation and rules-only fallback
│   ├── fixer/                     # Exorcist: GitHub App client and draft PRs
│   ├── notifier-discord/          # Banshee stub
│   ├── gateway/                   # Single model path for all Agents
│   ├── work/                      # Pure Work item decisions and private command/state contracts
│   └── actuator/                  # separate deployable: executes approved signed actions only
├── examples/haunted-candy-shop/   # fault-injectable demo app (api + worker + postgres)
├── deploy/
│   ├── compose/                   # graveshift.compose.yml, demo.compose.yml, prometheus.yml
│   ├── k8s/                       # kustomize base + overlays/kind, rbac.yaml, networkpolicy.yaml
│   ├── kind/                      # kind-config.yaml, bootstrap.sh
│   └── helm/graveshift/           # stretch
├── powers/graveshift/             # Kiro Power (stretch)
├── scripts/kiro/                  # guard-shell.mjs, secret-scan.mjs (used by hooks)
├── prisma/                        # Durable PostgreSQL schema and immutable migration history
├── docs/                          # ARCHITECTURE.md, SECURITY.md, DECISIONS.md, ADRs and verification records
├── graveshift.config.yaml         # one committed config: boot, agents, policy, fix
├── KIRO_USAGE.md · README.md · LICENSE (Apache-2.0) · NOTICE
├── bunfig.toml · package.json · tsconfig.base.json
├── .oxfmtrc.json · .oxlintrc.json
└── .github/workflows/ci.yml
```

Rules:
- A Collector implements the integration lifecycle and publishes prepared Event envelopes. Protocol-specific reads stay with its adapter. Exercise acquisition, redelivery and stop through that interface.
- Before a cross-process change, read ADR 0020 and `docs/ARCHITECTURE.md`. The daemon owns orchestration; API repositories own durable operations.
- Packages are imported only through `package.json#exports` entry points. No `export *` folder barrels.
- Hooks are defined in `.kiro/hooks/`; their helper scripts live in `scripts/kiro/`.
