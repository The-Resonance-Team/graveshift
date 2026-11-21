-- AlterTable: the Sentry DSN project id is optional for non-Sentry credentials.
-- A unique index on a nullable column allows many NULL rows in PostgreSQL.
ALTER TABLE "credentials" ADD COLUMN "project_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "credentials_tenant_id_project_id_key" ON "credentials"("tenant_id", "project_id");
