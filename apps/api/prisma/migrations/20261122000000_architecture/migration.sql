-- Applied on top of the immutable platform-v2 foundation migration.
-- The foundation already owns project_id and the append-only audit triggers.

-- CreateEnum
CREATE TYPE "FixAttemptTrigger" AS ENUM ('auto_fix', 'fix_now');

-- CreateEnum
CREATE TYPE "FixAttemptState" AS ENUM ('claimed', 'awaiting_answer', 'running', 'publishing', 'completed', 'failed', 'needs_human', 'uncertain');

-- AlterTable
ALTER TABLE "work_items" ADD COLUMN "active_attempt_id" TEXT;

-- AlterTable
ALTER TABLE "work_items" ADD COLUMN "diagnosis" JSONB;

-- AlterTable. Nullable: the platform-v2 audit chain writes entries without an event key.
ALTER TABLE "audit_entries" ADD COLUMN     "event_key" TEXT;

-- CreateTable
CREATE TABLE "fix_attempts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "command_id" TEXT NOT NULL,
    "work_item_id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "worker_id" TEXT,
    "lease_until" TIMESTAMP(3),
    "trigger" "FixAttemptTrigger" NOT NULL,
    "state" "FixAttemptState" NOT NULL,
    "routing_progress" JSONB,
    "params" JSONB NOT NULL,
    "question_id" TEXT,
    "result" JSONB,
    "publication" JSONB,
    "base_sha" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fix_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_commands" (
    "project_id" TEXT NOT NULL,
    "command_id" TEXT NOT NULL,
    "work_item_id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "work_version" INTEGER,
    "attempt_id" TEXT,
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_commands_pkey" PRIMARY KEY ("project_id","command_id")
);

-- CreateTable
CREATE TABLE "hauntings" (
    "project_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "incident" JSONB NOT NULL,
    "diagnosis" JSONB,
    "detections" JSONB NOT NULL,
    "pr" JSONB,
    "timeline" JSONB NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hauntings_pkey" PRIMARY KEY ("project_id","id")
);

-- CreateTable
CREATE TABLE "action_claims" (
    "project_id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "result" JSONB,
    "admitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_claims_pkey" PRIMARY KEY ("project_id","token_id")
);

-- CreateIndex
CREATE INDEX "fix_attempts_project_id_work_item_id_idx" ON "fix_attempts"("project_id", "work_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "fix_attempts_project_id_command_id_key" ON "fix_attempts"("project_id", "command_id");

-- CreateIndex
CREATE INDEX "work_commands_project_id_work_item_id_idx" ON "work_commands"("project_id", "work_item_id");

-- CreateIndex
CREATE INDEX "hauntings_project_id_service_idx" ON "hauntings"("project_id", "service");

-- CreateIndex
CREATE INDEX "action_claims_project_id_service_admitted_at_idx" ON "action_claims"("project_id", "service", "admitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "action_claims_project_id_action_id_key" ON "action_claims"("project_id", "action_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_items_project_id_id_key" ON "work_items"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_entries_project_id_event_key_key" ON "audit_entries"("project_id", "event_key");

-- AddForeignKey
ALTER TABLE "fix_attempts" ADD CONSTRAINT "fix_attempts_project_id_work_item_id_fkey" FOREIGN KEY ("project_id", "work_item_id") REFERENCES "work_items"("project_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_commands" ADD CONSTRAINT "work_commands_project_id_work_item_id_fkey" FOREIGN KEY ("project_id", "work_item_id") REFERENCES "work_items"("project_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
