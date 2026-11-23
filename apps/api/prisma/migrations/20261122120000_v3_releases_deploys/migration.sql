-- CreateTable
CREATE TABLE "deploys" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date_started" TIMESTAMP(3) NOT NULL,
    "date_finished" TIMESTAMP(3),
    "url" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deploys_pkey" PRIMARY KEY ("id")
);

-- AlterTable. A Haunting inherits the Deployment of the Event that opened it.
ALTER TABLE "hauntings" ADD COLUMN     "deployment_id" TEXT;

-- CreateIndex
CREATE INDEX "deploys_project_id_created_at_id_idx" ON "deploys"("project_id", "created_at" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "deploys_project_id_deployment_id_environment_key" ON "deploys"("project_id", "deployment_id", "environment");

-- AddForeignKey
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- BEGIN unmanaged v3 deploy enforcement (outside Prisma's schema model).
CREATE FUNCTION prevent_deploy_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- One closure transition is the only permitted change: closed_at from NULL to a timestamp.
  -- Every other field stays immutable; DELETE stays forbidden.
  IF TG_OP = 'UPDATE' AND OLD."closed_at" IS NULL AND NEW."closed_at" IS NOT NULL
     AND (to_jsonb(NEW) - 'closed_at') = (to_jsonb(OLD) - 'closed_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'deploys are append-only';
END;
$$;

CREATE TRIGGER deploys_no_update
BEFORE UPDATE ON "deploys"
FOR EACH ROW EXECUTE FUNCTION prevent_deploy_mutation();

CREATE TRIGGER deploys_no_delete
BEFORE DELETE ON "deploys"
FOR EACH ROW EXECUTE FUNCTION prevent_deploy_mutation();

CREATE FUNCTION prevent_linked_project_org_move() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."org_id" IS DISTINCT FROM OLD."org_id" AND EXISTS (
    SELECT 1 FROM "deploys" WHERE "project_id" = NEW."project_id"
  ) THEN
    RAISE EXCEPTION 'project organization is immutable while linked to a Deployment';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_org_link_guard
BEFORE UPDATE ON "projects"
FOR EACH ROW EXECUTE FUNCTION prevent_linked_project_org_move();

ALTER TABLE "deploys" ADD CONSTRAINT "deploys_url_http_check"
CHECK ("url" IS NULL OR "url" ~* '^https?://');
-- END unmanaged v3 deploy enforcement.
