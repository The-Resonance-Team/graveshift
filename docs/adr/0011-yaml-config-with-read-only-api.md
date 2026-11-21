# Agent config stays in YAML; the API exposes a read-only view

Status: accepted

On 2026-11-21 the owner chose YAML as the source of truth for agent and policy config in v2. The loaders already exist: `packages/agents/src/config.ts` validates `AGENTS_PATH` with Zod at boot, and `packages/policy/src/load.ts` validates the policy file the same way. Invalid config fails boot. There is no hot reload in v2. A config change needs a file edit and a restart.

The NestJS API exposes a read-only view of the validated config through generated types and OpenAPI. It does not write config files and does not hold config in memory for editing. Another frontend engineer owns the dashboard; this repo ships generated contracts and endpoint definitions only, with no visual design and no UI code.

Boot settings live in one Zod schema in `apps/api`. That schema covers host, port, NATS settings, file paths and auth settings. A secret is never stored in YAML and never returned by the config API. A key comes only from the environment variable named by the agent's `apiKeyEnv`.

The v1 config path is removed with the v1 daemon. `loadConfigFile()` in `packages/core/src/config.ts` and `graveshift.config.example.yaml` have no consumer after #40 deletes `apps/_daemon` and `packages/llm`. Agents and policy keep their own loaders. No third config format is kept.

Trade-off: config changes need a restart, but boot validation, version control and the one-source rule stay simple. Editable config moves to v3 with multi-tenancy, when write authorization and an audit path can be designed with the dashboard.
