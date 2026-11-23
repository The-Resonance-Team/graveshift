# Commit SHA as the Deployment id

Status: accepted

On 2026-11-23 the owner decided how Graveshift identifies a Deployment. `deploymentId` is the 40-hex git commit SHA. Vercel gives each Deployment a new id; Graveshift uses the SHA as the identity so that triage is by code version.

The client supplies the SHA at Deployment create and the server checks its 40-hex format. The server verifies the SHA against the source tree at patch time. CI supplies the human label `title` from `git log -1 --format=%s`, so the label works on any git-compatible platform.

A UNIQUE key on (project_id, deployment_id, environment) makes redeploy of the same SHA to the same Environment name idempotent. A rollback reuses the old Deployment bucket; it does not create a new one.

The agent patches at the deployed SHA. Tree and blob SHA checks run at that SHA. The branch-HEAD freshness check is dropped.

Code keeps the legacy identifiers: the `Deploy` model, the `deploys` table, the `deployment_id` column, `DeployRepo` and the `title` field. User-facing docs say Deployment. The database uses a direct foreign key from `deploys.project_id` to `projects` with ON DELETE RESTRICT and ON UPDATE RESTRICT. It adds indexes on (project_id, created_at DESC, id) and the UNIQUE key. At hundreds or thousands of rows per Project there is no partitioning.

Trade-off: each deploy act is not separately identified. The same SHA in the same Environment is the same bucket. In return, redeploy and rollback are idempotent and triage is by code version.
