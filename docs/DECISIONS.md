# DECISIONS (STUB)

> Scaffold only. Record verified facts here as the build proceeds (bootstrap doc section 0, step 5).

Decisions log (to confirm):

| ID | Decision | Status |
| --- | --- | --- |
| D1 | Kubernetes in MVP; keep Docker Compose | owner-decided |
| D2 | LLM: one Vercel AI SDK `openai-compatible` model, rules-only fallback | owner-decided 2026-11-21, see `docs/adr/0002-single-ai-sdk-provider.md` |
| D3 | Demo uses kind (local) and k3s (public VM) | owner-decided |
| D4 | Bun-native toolchain: bun 1.4.4, TypeScript 7.0.2, fast-check 4.10.2; `bun test --check`; no Vitest at scaffold time | verified 2026-11-18 |
| D5 | No `kiro init` command exists. Setup is manual with the `kiro-cli` binary. V3 hooks use PascalCase triggers. A `PreToolUse` command blocks only on exit code `2`, and `PostTaskExec` is the spec-task trigger | verified 2026-11-18 |
| D6 | Build all 16 engineering work items from issue #10; keep every "never cut" item; defer external credentials and Discord to a next-session issue | owner-decided 2026-11-20, see `docs/adr/0001-full-scope-for-kiroween.md` |

Verification sources:

- D4: branch `research/toolchain-baseline`, file `docs/research/toolchain-baseline.md`.
- D5: branch `research/kiro-scaffold`, file `docs/research/kiro-scaffold.md`.

Pending verification (record results here):

- Price table for the configured model; the example config uses zero prices.
- Exact versions of Next.js, Zod, discord.js and the Kubernetes client. Vitest is not used at scaffold time.
- Crew app manifest details and socket-proxy restart granularity.

## Pending decisions

- ORM for `packages/store`: the bootstrap names Drizzle. Prisma 7 was considered and deferred. The team library baseline assigns Prisma 7 to NestJS APIs only, and Bun-first favors `Bun.SQL`. Keep Drizzle with Bun drivers (`drizzle-orm/bun-sqlite`, `drizzle-orm/bun-sql`) as the working assumption. Revisit when `packages/store` is implemented; open a wayfinder ticket then. Owner has not confirmed a final choice.

Implementation note (2026-11-20): `packages/store` ships `drizzle-orm@0.45.4` with `drizzle-orm/bun-sqlite` only (inline DDL, `UPDATE`/`DELETE` blocked by triggers). The `AuditStore` interface is async so a `bun-sql` Postgres implementation can replace it without caller changes. The final ORM choice is still unconfirmed by the owner. Zod 4.6.7 is the validation library in `packages/core`. Time-handling uses `Date#toISOString` only (wire serialization); no `date-fns` dependency yet.
