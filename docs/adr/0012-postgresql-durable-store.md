# PostgreSQL is the durable store; Prisma 7 owns the schema

Status: accepted

On 2026-11-21 the owner chose PostgreSQL as the single durable store for platform v2. Work items, the audit chain and Credentials move into it; NATS JetStream stays the authoritative source for Event occurrences and Cursors, and derived caches such as watcher deduplication, budget counters and replay windows stay in memory. Config stays in YAML under ADR 0011. A database replaces the file-backed and process-lifetime stores so that a restart cannot lose state and two API instances cannot hold different copies of it.

The NestJS API owns the Prisma schema, the generated client and all migrations. Prisma uses the `prisma-client` generator, an `@prisma/client` alias, `prisma.config.ts` for the connection URL, a driver adapter, and one migration per model change, as the team library baseline requires. The hash-chain logic moves out of `packages/store` into the API audit module, and `packages/store` is deleted with the v1 daemon under ticket #40. Every stored row carries a fixed `tenantId` for v3; the SQL column is `tenant_id` through `@map`. Work item transitions use atomic updates with an expected state and a version column, so two requests cannot claim the same item.

There is no production data in v2, so the cutover is one change with no dual-write or backfill. Local development and database tests use Docker Postgres. Prisma Postgres in the cloud is provisioned only after the owner supplies a service token; no token or connection string is committed, and GitHub Actions makes no database or network call. Redis is a v3 cache for large services; v2 only keeps repository ports async so a cache can wrap them later.

Trade-off: PostgreSQL adds one service and locks the schema into Prisma, but it gives one source of truth, restart safety and one place for migrations. Reversing this choice after data exists would need a full migration.
