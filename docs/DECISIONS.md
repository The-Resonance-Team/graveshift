# Decisions

This file records decisions that do not fit the ADR sequence.

## Init migration checksum

Date: 2026-11-22

The v2 init migration is `apps/api/prisma/migrations/20261121052714_init/migration.sql`. Commit 20186f0 amended this file after it first landed. The owner kept one init migration. No follow-up migration is added.

Prisma stores SHA-256 of the migration.sql bytes in `_prisma_migrations.checksum`. The first two values below were read from that column after `prisma migrate deploy` on a local Docker Postgres. They were not only computed from the file.

| Migration state | SHA-256 of migration.sql |
| --- | --- |
| Before commit 20186f0 | `4d02b7e1deb1d601fa0632c7b0cbb5da380d9869dcd5e04c1acd376a110db5ce` |
| After commit 20186f0 | `f251d5ebd26f8942cce524a7d662724c91f285a58557168ce4bc68c8276ff0f5` |
| Current, after the `projectId` rewrite (ADR 0018) | `266ec8b5a19b51d405b3754780306bc1b032b3e3c2b15daa25de4ea4281fd518` |

The current value was also read from `_prisma_migrations.checksum` after `prisma migrate deploy` on a local Docker Postgres (`postgres:18.7`, `deploy/compose/database-test.yml`). It equals the SHA-256 of the file.

To reproduce the current value, run `shasum -a 256 apps/api/prisma/migrations/20261121052714_init/migration.sql`.

Recreate any local database that applied the old checksum. Prisma refuses a migration when the stored checksum differs from the file. A fresh database applies the current file. No production data existed in v2, so no data backfill is needed.

## Init migration rewrite for `projectId`

ADR 0018 replaced `tenantId` with `projectId`. The owner chose to rewrite the init migration in place instead of adding a migration. Every `tenant_id` column is now `project_id`. The `credentials` table has one `project_id` column. The separate Sentry `project_id` column, its `(tenant_id, project_id)` unique index and the migration `20261122000000_add_credential_project_id` are removed. The unique index on `credentials` is now `("project_id", "hash")`. The audit trigger is unchanged.

Recreate any local database that applied an earlier checksum, including one that applied `20261122000000_add_credential_project_id`. No production data existed in v2, so no data backfill is needed.
