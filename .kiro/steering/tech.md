---
inclusion: always
---
# Tech rules (Bun-native team stack)

- TypeScript strict, ESM, Node LTS. No `any` (use `unknown` + Zod).
- Bun is the package manager, runner and test runner. Workspaces are Bun workspaces.
  - Format: `bun fmt` using the root `.oxfmtrc.json`.
  - Lint: `bun lint --no-script` using the root `.oxlintrc.json`.
  - Typecheck: `bun check`.
  - Tests: `bun test --check`.
  - Config drift and per-app formatter/linter configs are not allowed.
- Keep every source file under 300 lines (enforced by the lint baseline).
- `packages/core` Zod schemas are the single source of truth; infer types with `z.infer`.
- Errors: typed Error subclasses with codes, or Result types. Never throw strings.
- Tests: Bun test runner. Guardrail packages (policy, redactor, actuator, `core/state`, `fixer/guard`) REQUIRE `fast-check` properties.
- Send every model call through `packages/gateway`. Import the provider SDK only in that package.
- Docker ONLY via the docker-socket-proxy URL. K8s ONLY via `@kubernetes/client-node` with the in-cluster ServiceAccount.
- Logging: pino JSON. External content passes `packages/redactor` before logging.
- Times: store UTC ISO; display in the user's timezone (default Asia/Saigon in the demo).
