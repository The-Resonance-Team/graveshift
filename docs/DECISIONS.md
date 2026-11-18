# DECISIONS (STUB)

> Scaffold only. Record verified facts here as the build proceeds (bootstrap doc section 0, step 5).

Decisions log (to confirm):

| ID | Decision | Status |
| --- | --- | --- |
| D1 | Kubernetes in MVP; keep Docker Compose | owner-decided |
| D2 | LLM: Amazon Bedrock primary; Gemini -> Ollama -> rules-only fallback | owner-decided |
| D3 | Demo uses kind (local) and k3s (public VM) | owner-decided |
| D4 | Bun-native toolchain: bun 1.4.4, TypeScript 7.0.2, fast-check 4.10.2; `bun test --check`; no Vitest at scaffold time | verified 2026-11-18 |
| D5 | No `kiro init` command exists. Setup is manual with the `kiro-cli` binary. V3 hooks use PascalCase triggers. A `PreToolUse` command blocks only on exit code `2`, and `PostTaskExec` is the spec-task trigger | verified 2026-11-18 |

Verification sources:

- D4: branch `research/toolchain-baseline`, file `docs/research/toolchain-baseline.md`.
- D5: branch `research/kiro-scaffold`, file `docs/research/kiro-scaffold.md`.

Pending verification (record results here):

- Bedrock model IDs and region (section 11.3); Gemini free-tier model/limits.
- Exact versions of Next.js, Zod, AI SDK, discord.js and the Kubernetes client. Vitest is not used at scaffold time.
- Crew app manifest details and socket-proxy restart granularity.

## Pending decisions

- ORM for `packages/store`: the bootstrap names Drizzle. Prisma 7 was considered and deferred. The team library baseline assigns Prisma 7 to NestJS APIs only, and Bun-first favors `Bun.SQL`. Keep Drizzle with Bun drivers (`drizzle-orm/bun-sqlite`, `drizzle-orm/bun-sql`) as the working assumption. Revisit when `packages/store` is implemented; open a wayfinder ticket then. Owner has not confirmed a final choice.
