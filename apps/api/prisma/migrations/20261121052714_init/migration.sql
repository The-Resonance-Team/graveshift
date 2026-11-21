-- CreateEnum
CREATE TYPE "WorkItemStatus" AS ENUM ('todo', 'in_progress', 'in_review', 'done');

-- CreateEnum
CREATE TYPE "WorkItemPriority" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "WorkItemSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('mcp', 'plugin');

-- CreateTable
CREATE TABLE "work_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "success_criteria" TEXT[],
    "subtasks" JSONB NOT NULL,
    "status" "WorkItemStatus" NOT NULL,
    "priority" "WorkItemPriority" NOT NULL,
    "assignee" TEXT NOT NULL,
    "reporter" TEXT NOT NULL,
    "start_date" DATE,
    "due_date" DATE,
    "sprint" TEXT,
    "parent" TEXT,
    "labels" TEXT[],
    "team" TEXT NOT NULL,
    "watchers" TEXT[],
    "severity" "WorkItemSeverity" NOT NULL,
    "service" TEXT NOT NULL,
    "diagnosis_ref" TEXT NOT NULL,
    "auto_fix_allowed" BOOLEAN NOT NULL,
    "fix_priority" INTEGER NOT NULL,
    "draft_pr" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "tenant_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "actor" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "incident_id" TEXT,
    "payload" JSONB NOT NULL,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("tenant_id","seq")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "scopes" TEXT[],
    "service" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "expiration_audited_at" TIMESTAMP(3),

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_items_tenant_id_idx" ON "work_items"("tenant_id");

-- CreateIndex
CREATE INDEX "credentials_hash_idx" ON "credentials"("hash");
CREATE UNIQUE INDEX "credentials_tenant_id_hash_key" ON "credentials"("tenant_id", "hash");

-- BEGIN unmanaged append-only audit enforcement (outside Prisma's schema model).
CREATE FUNCTION prevent_audit_entry_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit entries are append-only';
END;
$$;

CREATE TRIGGER audit_entries_no_update
BEFORE UPDATE ON "audit_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_entry_mutation();

CREATE TRIGGER audit_entries_no_delete
BEFORE DELETE ON "audit_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_entry_mutation();
-- END unmanaged append-only audit enforcement.
