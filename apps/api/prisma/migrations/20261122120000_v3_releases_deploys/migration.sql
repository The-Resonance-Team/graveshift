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
ALTER TABLE "releases" ADD CONSTRAINT "releases_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_releases" ADD CONSTRAINT "project_releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_releases" ADD CONSTRAINT "project_releases_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploy_projects" ADD CONSTRAINT "deploy_projects_deploy_id_fkey" FOREIGN KEY ("deploy_id") REFERENCES "deploys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploy_projects" ADD CONSTRAINT "deploy_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE CASCADE ON UPDATE CASCADE;
