-- CreateTable
CREATE TABLE "releases" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_releases" (
    "project_id" TEXT NOT NULL,
    "release_id" TEXT NOT NULL,

    CONSTRAINT "project_releases_pkey" PRIMARY KEY ("project_id","release_id")
);

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
    "release_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date_started" TIMESTAMP(3) NOT NULL,
    "date_finished" TIMESTAMP(3),
    "url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deploys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deploy_projects" (
    "deploy_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,

    CONSTRAINT "deploy_projects_pkey" PRIMARY KEY ("deploy_id","project_id")
);

-- CreateIndex
CREATE INDEX "releases_org_id_idx" ON "releases"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "releases_org_id_version_key" ON "releases"("org_id", "version");

-- CreateIndex
CREATE INDEX "project_releases_release_id_idx" ON "project_releases"("release_id");

-- CreateIndex
CREATE INDEX "environments_org_id_idx" ON "environments"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "environments_org_id_name_key" ON "environments"("org_id", "name");

-- CreateIndex
CREATE INDEX "deploys_org_id_release_id_idx" ON "deploys"("org_id", "release_id");

-- CreateIndex
CREATE INDEX "deploys_environment_id_idx" ON "deploys"("environment_id");

-- CreateIndex
CREATE INDEX "deploy_projects_project_id_idx" ON "deploy_projects"("project_id");

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_releases" ADD CONSTRAINT "project_releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_releases" ADD CONSTRAINT "project_releases_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploy_projects" ADD CONSTRAINT "deploy_projects_deploy_id_fkey" FOREIGN KEY ("deploy_id") REFERENCES "deploys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploy_projects" ADD CONSTRAINT "deploy_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BEGIN unmanaged v3 deploy enforcement (outside Prisma's schema model).
CREATE FUNCTION prevent_deploy_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'deploys are append-only';
END;
$$;

CREATE TRIGGER deploys_no_update
BEFORE UPDATE ON "deploys"
FOR EACH ROW EXECUTE FUNCTION prevent_deploy_mutation();

CREATE TRIGGER deploys_no_delete
BEFORE DELETE ON "deploys"
FOR EACH ROW EXECUTE FUNCTION prevent_deploy_mutation();

CREATE FUNCTION prevent_deploy_project_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'deploy project links are append-only';
END;
$$;

CREATE TRIGGER deploy_projects_no_update
BEFORE UPDATE ON "deploy_projects"
FOR EACH ROW EXECUTE FUNCTION prevent_deploy_project_mutation();

CREATE TRIGGER deploy_projects_no_delete
BEFORE DELETE ON "deploy_projects"
FOR EACH ROW EXECUTE FUNCTION prevent_deploy_project_mutation();

CREATE FUNCTION enforce_deploy_organization() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "releases" AS "release"
    WHERE "release"."id" = NEW."release_id" AND "release"."org_id" = NEW."org_id"
  ) THEN
    RAISE EXCEPTION 'deploy release belongs to another organization';
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

CREATE FUNCTION enforce_release_project_organization() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "projects" AS "project"
    JOIN "releases" AS "release" ON "release"."id" = NEW."release_id"
    WHERE "project"."project_id" = NEW."project_id" AND "project"."org_id" = "release"."org_id"
  ) THEN
    RAISE EXCEPTION 'release project belongs to another organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER project_releases_org_consistency
BEFORE INSERT ON "project_releases"
FOR EACH ROW EXECUTE FUNCTION enforce_release_project_organization();

CREATE FUNCTION enforce_deploy_project_organization() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "projects" AS "project"
    JOIN "deploys" AS "deploy" ON "deploy"."id" = NEW."deploy_id"
    WHERE "project"."project_id" = NEW."project_id" AND "project"."org_id" = "deploy"."org_id"
  ) THEN
    RAISE EXCEPTION 'deploy project belongs to another organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER deploy_projects_org_consistency
BEFORE INSERT ON "deploy_projects"
FOR EACH ROW EXECUTE FUNCTION enforce_deploy_project_organization();

CREATE FUNCTION prevent_v3_org_move() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'v3 organization scope is immutable';
END;
$$;

CREATE TRIGGER releases_org_immutable
BEFORE UPDATE ON "releases"
FOR EACH ROW WHEN (NEW."org_id" IS DISTINCT FROM OLD."org_id")
EXECUTE FUNCTION prevent_v3_org_move();

CREATE TRIGGER environments_org_immutable
BEFORE UPDATE ON "environments"
FOR EACH ROW WHEN (NEW."org_id" IS DISTINCT FROM OLD."org_id")
EXECUTE FUNCTION prevent_v3_org_move();

CREATE TRIGGER project_releases_project_immutable
BEFORE UPDATE ON "project_releases"
FOR EACH ROW WHEN (
  NEW."project_id" IS DISTINCT FROM OLD."project_id"
  OR NEW."release_id" IS DISTINCT FROM OLD."release_id"
)
EXECUTE FUNCTION prevent_v3_org_move();

CREATE FUNCTION prevent_linked_project_org_move() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."org_id" IS DISTINCT FROM OLD."org_id" AND (
    EXISTS (SELECT 1 FROM "project_releases" WHERE "project_id" = NEW."project_id")
    OR EXISTS (SELECT 1 FROM "deploy_projects" WHERE "project_id" = NEW."project_id")
  ) THEN
    RAISE EXCEPTION 'project organization is immutable while linked to a Release or Deploy';
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
