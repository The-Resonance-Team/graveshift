# Decisions

This file records decisions that do not fit the ADR sequence.

## Init migration checksum

Date: 2026-11-22

The v2 init migration is `apps/api/prisma/migrations/20261121052714_init/migration.sql`. Commit 20186f0 amended this file after it first landed. The owner kept one init migration. No follow-up migration is added.

Prisma stores SHA-256 of the migration.sql bytes in `_prisma_migrations.checksum`. Both values below were read from that column after `prisma migrate deploy` on a local Docker Postgres. They were not only computed from the file.

| Migration state | SHA-256 of migration.sql |
| --- | --- |
| Before commit 20186f0 | `4d02b7e1deb1d601fa0632c7b0cbb5da380d9869dcd5e04c1acd376a110db5ce` |
| Current, after commit 20186f0 | `f251d5ebd26f8942cce524a7d662724c91f285a58557168ce4bc68c8276ff0f5` |

To reproduce the current value, run `shasum -a 256 apps/api/prisma/migrations/20261121052714_init/migration.sql`.

Recreate any local database that applied the old checksum. Prisma refuses a migration when the stored checksum differs from the file. A fresh database applies the current file. No production data existed in v2, so no data backfill is needed.
