-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'member');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "account_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("account_id","org_id")
);

-- CreateTable
CREATE TABLE "projects" (
    "project_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "oauth_clients" (
    "client_id" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "scopes" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "daemon_grants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "project_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daemon_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "memberships_org_id_idx" ON "memberships"("org_id");

-- CreateIndex
CREATE INDEX "projects_org_id_idx" ON "projects"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_org_id_slug_key" ON "projects"("org_id", "slug");

-- CreateIndex
CREATE INDEX "oauth_clients_org_id_idx" ON "oauth_clients"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "daemon_grants_name_key" ON "daemon_grants"("name");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BEGIN unmanaged identity data rewrite
-- Each distinct legacy project id gets one numeric id. All seven project_id rows
-- are rewritten in the same transaction. No mapping column survives the rewrite.
CREATE SEQUENCE IF NOT EXISTS "project_numeric_id_seq" START WITH 1000;

CREATE TEMP TABLE "legacy_project_ids" (
    "old_id" TEXT NOT NULL PRIMARY KEY,
    "new_id" TEXT NOT NULL
);

INSERT INTO "legacy_project_ids" ("old_id", "new_id")
SELECT "project_id", nextval('project_numeric_id_seq')::text
FROM (
    SELECT "project_id" FROM "work_items"
    UNION SELECT "project_id" FROM "fix_attempts"
    UNION SELECT "project_id" FROM "work_commands"
    UNION SELECT "project_id" FROM "hauntings"
    UNION SELECT "project_id" FROM "audit_entries"
    UNION SELECT "project_id" FROM "action_claims"
    UNION SELECT "project_id" FROM "credentials"
) AS "all_projects"
ORDER BY "project_id";

DROP TRIGGER IF EXISTS "audit_entries_no_update" ON "audit_entries";
DROP TRIGGER IF EXISTS "audit_entries_no_delete" ON "audit_entries";

UPDATE "work_items" AS "row" SET "project_id" = "map"."new_id"
FROM "legacy_project_ids" AS "map" WHERE "row"."project_id" = "map"."old_id";
UPDATE "fix_attempts" AS "row" SET "project_id" = "map"."new_id"
FROM "legacy_project_ids" AS "map" WHERE "row"."project_id" = "map"."old_id";
UPDATE "work_commands" AS "row" SET "project_id" = "map"."new_id"
FROM "legacy_project_ids" AS "map" WHERE "row"."project_id" = "map"."old_id";
UPDATE "hauntings" AS "row" SET "project_id" = "map"."new_id"
FROM "legacy_project_ids" AS "map" WHERE "row"."project_id" = "map"."old_id";
UPDATE "audit_entries" AS "row" SET "project_id" = "map"."new_id"
FROM "legacy_project_ids" AS "map" WHERE "row"."project_id" = "map"."old_id";
UPDATE "action_claims" AS "row" SET "project_id" = "map"."new_id"
FROM "legacy_project_ids" AS "map" WHERE "row"."project_id" = "map"."old_id";
UPDATE "credentials" AS "row" SET "project_id" = "map"."new_id"
FROM "legacy_project_ids" AS "map" WHERE "row"."project_id" = "map"."old_id";

CREATE TRIGGER "audit_entries_no_update" BEFORE UPDATE ON "audit_entries" FOR EACH ROW EXECUTE FUNCTION "prevent_audit_entry_mutation"();
CREATE TRIGGER "audit_entries_no_delete" BEFORE DELETE ON "audit_entries" FOR EACH ROW EXECUTE FUNCTION "prevent_audit_entry_mutation"();

-- Migrated Projects belong to one system Organization. The root admin adopts
-- them on first boot, so no account is created by this migration.
INSERT INTO "organizations" ("id", "name", "slug")
SELECT '00000000-0000-4000-8000-000000000000', 'Migrated', 'migrated'
WHERE EXISTS (SELECT 1 FROM "legacy_project_ids")
ON CONFLICT DO NOTHING;

INSERT INTO "projects" ("project_id", "org_id", "name", "slug")
SELECT "new_id", '00000000-0000-4000-8000-000000000000',
       'Migrated Project ' || "new_id", 'migrated-' || "new_id"
FROM "legacy_project_ids"
ON CONFLICT DO NOTHING;

-- The daemon grant names the migrated Projects. Without this row the grant
-- check would return 403 for every rewritten Project after the migration.
INSERT INTO "daemon_grants" ("id", "name", "project_ids")
SELECT '00000000-0000-4000-8000-000000000001', 'default',
       ARRAY(SELECT "new_id" FROM "legacy_project_ids")
WHERE EXISTS (SELECT 1 FROM "legacy_project_ids")
ON CONFLICT ("name") DO NOTHING;
-- END unmanaged identity data rewrite.
