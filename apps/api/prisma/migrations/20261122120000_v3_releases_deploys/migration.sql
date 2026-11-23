-- CreateTable
CREATE TABLE "environments" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deploys" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date_started" TIMESTAMP(3) NOT NULL,
    "date_finished" TIMESTAMP(3),
    "url" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deploys_pkey" PRIMARY KEY ("id")
);

-- AlterTable. The audit chain keeps one projectId per row; deploymentId is optional context.
ALTER TABLE "audit_entries" ADD COLUMN     "deployment_id" TEXT;

-- AlterTable. A Haunting inherits the Deployment of the Event that opened it.
ALTER TABLE "hauntings" ADD COLUMN     "deployment_id" TEXT;

-- CreateIndex
CREATE INDEX "environments_org_id_idx" ON "environments"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "environments_org_id_name_key" ON "environments"("org_id", "name");

-- CreateIndex
CREATE INDEX "deploys_project_id_created_at_id_idx" ON "deploys"("project_id", "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "deploys_environment_id_idx" ON "deploys"("environment_id");

-- CreateIndex
CREATE UNIQUE INDEX "deploys_project_id_deployment_id_environment_id_key" ON "deploys"("project_id", "deployment_id", "environment_id");

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

CREATE FUNCTION enforce_deploy_organization() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "projects" AS "project"
    WHERE "project"."project_id" = NEW."project_id" AND "project"."org_id" = NEW."org_id"
  ) THEN
    RAISE EXCEPTION 'deploy project belongs to another organization';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "environments" AS "environment"
    WHERE "environment"."id" = NEW."environment_id" AND "environment"."org_id" = NEW."org_id"
  ) THEN
    RAISE EXCEPTION 'deploy environment belongs to another organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER deploys_org_consistency
BEFORE INSERT ON "deploys"
FOR EACH ROW EXECUTE FUNCTION enforce_deploy_organization();

CREATE FUNCTION prevent_v3_org_move() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'v3 organization scope is immutable';
END;
$$;

CREATE TRIGGER environments_org_immutable
BEFORE UPDATE ON "environments"
FOR EACH ROW WHEN (NEW."org_id" IS DISTINCT FROM OLD."org_id")
EXECUTE FUNCTION prevent_v3_org_move();

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
