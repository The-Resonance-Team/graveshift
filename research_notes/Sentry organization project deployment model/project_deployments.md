# Sentry Organization / Project / Deployment Model

Research scope: primary sources only (docs.sentry.io, getsentry/sentry source on GitHub, cli docs). Retrieved 2026-11-22. Source files were fetched from the `master` branch of `getsentry/sentry`; line numbers refer to that snapshot.

## Q1. What identifies a Sentry Project: numeric id, slug, or both? Is the numeric id in the DSN the same as the Project id used by the API? Quote a DSN example and explain its parts.

### Takeaway
A Project has **both** a numeric id (assigned by Sentry) and a slug (unique inside one Organization) plus a name. The numeric id in the DSN path is the same `Project.id` that the REST API uses; the API exposes it as `id` / `projectId`.

### Cited Findings
- DSN structure (exact quote): "`{PROTOCOL}://{PUBLIC_KEY}:{SECRET_KEY}@{HOST}{PATH}/{PROJECT_ID}`" and example `Sentry.init({ dsn: "https://public@sentry.example.com/1" });` with "Public Key = public", "Project ID = 1". The secret part "is optional and effectively deprecated" — [DSN explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/#the-parts-of-the-data-source-name-dsn)
- "The DSN configures the protocol, public key, server address, and project identifier." — [DSN explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/)
- Real modern DSN from a client-key API response: `"projectId": 4505281256090153` and `"public": "https://a785682ddda742d7a8a4088810e67791@o4504765715316736.ingest.sentry.io/4505281256090153"` — the path segment after the host equals the `projectId` field. Other DSN variants in the same response (csp, security, minidump, crons, otlp) also use `/api/4505281256090153/...` — [List a Project's Client Keys](https://docs.sentry.io/api/projects/list-a-projects-client-keys/)
- Project detail response shows both identifiers: `"id": "4505278496", "slug": "pump-station", "name": "Pump Station"` — [Retrieve a Project](https://docs.sentry.io/api/projects/retrieve-a-project/)
- Project API parameters accept either form: "`project_id_or_slug` ... The ID or slug of the project the resource belongs to. Project slugs are unique within each organization." — [Retrieve a Project](https://docs.sentry.io/api/projects/retrieve-a-project/), [List a Project's Client Keys](https://docs.sentry.io/api/projects/list-a-projects-client-keys/)
- Source: `ProjectKey.get_dsn()` builds the DSN with `.../{self.project_id}` — [projectkey.py L238–L251](https://github.com/getsentry/sentry/blob/master/src/sentry/models/projectkey.py#L238)
- Source: `ProjectKey.from_dsn()` parses the DSN path as an integer project id and looks up `ProjectKey.objects.get(public_key=..., project=<that id>)`; it rejects non-decimal or out-of-range ids — [projectkey.py L169–L181](https://github.com/getsentry/sentry/blob/master/src/sentry/models/projectkey.py#L169)
- `Project.slug = SentrySlugField(max_length=PROJECT_SLUG_MAX_LENGTH)` and `unique_together = (("organization", "slug"), ...)` — [project.py L257, L386](https://github.com/getsentry/sentry/blob/master/src/sentry/models/project.py#L257)
- DSN lookup edge case: "Only the DSN's public key is used: the host and project ID in the DSN are ignored." Example response: `{"projectSlug": "pump-station", "projectId": "2", ...}` — [Resolve a DSN to Its Project](https://docs.sentry.io/api/projects/resolve-a-dsn-to-its-project/)
- "Each Sentry project has its own unique DSN." — [DSN explainer, One DSN Per Project](https://docs.sentry.io/concepts/key-terms/dsn-explainer/#one-dsn-per-project)
- Host carries the org id: "if the host contains `o…`, the organization ID needs to match the new parent organization." — [What is a Sentry DSN?](https://www.sentry.help/en/articles/13964441-what-is-a-sentry-dsn)

### Inferences
- DSN parts map as: scheme = protocol; userinfo = client key public value (and optional secret); host = ingest endpoint (modern SaaS hosts include the org id as `o<orgId>`); trailing path segment = numeric `Project.id`.
- The numeric id is a bigint assigned by Sentry; the slug is the human-readable, user-settable identifier. API endpoints generally accept both in `{project_id_or_slug}`.
- In JSON responses the Project id is sometimes a string (`"id": "4505278496"`) and sometimes a number (`"projectId": 4505281256090153`); consumers must treat it as an opaque numeric identifier and not assume one JSON type.

### Gaps
- No primary source was found that lets a user choose the numeric Project id at creation time (see Q6).
- I did not verify whether the DSN path project id must match the key's project for every ingest path; the REST `dsn-lookup` endpoint explicitly ignores it, while `ProjectKey.from_dsn()` uses it. Treat these as two different code paths, not a contradiction.

## Q2. Does a Project belong to exactly one Organization? Can a Project belong to more than one Team?

### Takeaway
At any given time a Project belongs to **exactly one Organization** (Django foreign key) and can belong to **many Teams** (many-to-many through `ProjectTeam`). A project can be transferred to another Organization, but it never has two organizations at once.

### Cited Findings
- Source: `organization = FlexibleForeignKey("sentry.Organization")` and `teams = models.ManyToManyField("sentry.Team", related_name="teams", through=ProjectTeam)` — [project.py L261–L262](https://github.com/getsentry/sentry/blob/master/src/sentry/models/project.py#L261)
- Source: `ProjectTeam` has `project = FlexibleForeignKey("sentry.Project")`, `team = FlexibleForeignKey("sentry.Team")`, and `unique_together = (("project", "team"),)` — [projectteam.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/projectteam.py)
- Retrieve a Project response contains a single nested `"organization": {...}` object and an array `"teams": [...]` — [Retrieve a Project](https://docs.sentry.io/api/projects/retrieve-a-project/)
- "To grant a team access to a project, go to your project's Project Teams settings and click 'Add Team'." — [Ownership Rules](https://docs.sentry.io/product/issues/ownership-rules/#permissions)
- API: `POST /api/0/projects/{organization_id_or_slug}/{project_id_or_slug}/teams/{team_id_or_slug}/` — "Give a team access to a project." — [Add a Team to a Project](https://docs.sentry.io/api/projects/add-a-team-to-a-project/)
- Org role rule: "Can add projects for teams" is limited to Manager and Owner; "New projects can only be created and owned by teams the user is a Team Admin for." — [Organization and User Management](https://docs.sentry.io/organization/membership/)
- Project creation via API: "A personal team (`team-{username}`) is automatically created for the caller with Team Admin role, and the project is bound to it." — [Create a Project for an Organization](https://docs.sentry.io/api/projects/create-a-project-for-an-organization/)
- Transfer exists: guide on how to "transfer projects between Sentry organisations", with advice to "assign a Team to the project so it can be visible in the receiving organisation" — [Sentry Help: transfer projects](https://www.sentry.help/en/articles/13965080-how-can-i-transfer-projects-between-sentry-organisations)

### Inferences
- Team membership is an access grant (ProjectTeam join row), not an ownership change. Deleting the join row removes that team's access.
- The singular `"team"` field in API responses is a legacy/convenience field; the authoritative list is `"teams"`.

### Gaps
- No source was found that states a maximum number of teams per project.

## Q3. What is a Deployment in Sentry? Is it a first-class entity, an Event type (`deployment`), a Release artifact, or tied to an Environment? How does Sentry create and list them?

### Takeaway
A Deployment ("Deploy") is a **first-class database entity** (`Deploy`, table `sentry_deploy`), stored per organization, linked to exactly one Release and one Environment. It is **not** an Event type and **not** a Release artifact. It is created by the REST API (also wrapped by `sentry-cli`), and it also produces an Activity record for notifications.

### Cited Findings
- Source model `Deploy` (full fields): `organization_id`, `release = FlexibleForeignKey("sentry.Release")`, `environment_id = BoundedPositiveIntegerField`, `date_finished` (default `timezone.now`), `date_started`, `name` (max 64), `url`, `notified`; `db_table = "sentry_deploy"` — [deploy.py L19–L33](https://github.com/getsentry/sentry/blob/master/src/sentry/models/deploy.py#L19)
- Source: deploying creates `Activity` records with `type=ActivityType.DEPLOY.value`, data `{"version": ..., "deploy_id": ..., "environment": ...}`, once per project of the release — [deploy.py L78](https://github.com/getsentry/sentry/blob/master/src/sentry/models/deploy.py#L78)
- Source: creation code `Environment.objects.get_or_create(name=..., organization_id=organization.id)`, `env.add_project(project)`, then `Deploy.objects.create(organization_id=..., release=release, environment_id=env.id, ...)`; it also increments `Release.total_deploys` and sets `last_deploy_id` — [release_deploys.py](https://github.com/getsentry/sentry/blob/master/src/sentry/releases/endpoints/release_deploys.py)
- CLI docs: "To create a deploy you first create a release and then a deploy for it. At the very least, you should supply the 'environment' the deploy goes to (production, staging etc.). You can freely define this": `sentry-cli deploys new --release "$VERSION" -e ENVIRONMENT`; optional duration `-t $((now-start))` — [Release Management / Creating Deploys](https://docs.sentry.io/cli/releases/#creating-deploys)
- CLI docs: "Deploys can be listed too (however they cannot be deleted): `sentry-cli deploys list --release "$VERSION"`" — [Release Management](https://docs.sentry.io/cli/releases/#creating-deploys)
- Setup docs: "let Sentry know you've deployed your release by sending an additional request after creating a release: `sentry-cli releases --org ORGANIZATION_SLUG deploys VERSION new -e ENVIRONMENT`" and "You can also use our API to create a deploy." — [Set Up Releases](https://docs.sentry.io/product/releases/setup/#4-notify-sentry)
- REST create: `POST /api/0/organizations/{organization_id_or_slug}/releases/{version}/deploys/` — "Create a deploy for a given release." — [Create a Deploy](https://docs.sentry.io/api/releases/create-a-deploy/)
- REST list: `GET /api/0/organizations/{organization_id_or_slug}/releases/{version}/deploys/` — "Returns a list of deploys based on the organization, version, and project." — [List a Release's Deploys](https://docs.sentry.io/api/releases/list-a-releases-deploys/)
- New interactive Sentry CLI (different tool from `sentry-cli`): `sentry release deploy <org/version> <environment> [<name>]` and `sentry release deploys <org/version>` (list). Docs note: "These docs cover `sentry-cli` ... If you're looking for the interactive developer CLI ... check out the new Sentry CLI" — [cli.sentry.dev release commands](https://cli.sentry.dev/commands/release/), [docs.sentry.io/cli/releases/](https://docs.sentry.io/cli/releases/)
- SDK path (for Releases, not Deploys): "With your SDK configured to provide a release identifier and enable session tracking, you can monitor both releases and release health" and "You must have the environment configured in your SDK to use this feature." Release is auto-created: "Sentry will automatically create a release entity in the system the first time it sees an event with that release identifier." — [Set Up Releases](https://docs.sentry.io/product/releases/setup/#1-configure-your-sdk), [Releases](https://docs.sentry.io/product/releases/)
- Deploy serializer fields returned by the API: `id`, `environment`, `dateStarted`, `dateFinished`, `name`, `url` — [deploy serializer](https://github.com/getsentry/sentry/blob/master/src/sentry/api/serializers/models/deploy.py)

### Inferences
- The chain is: Organization → Release (version, org-scoped) → Deploy (release + environment + timestamps) → Environment (org-scoped name). One Release can have many Deploys, one per environment or repeated over time.
- A Deploy is tied to an Environment by foreign key (`environment_id`), and the API requires an `environment` body field. So a Deploy cannot exist without an Environment; an Environment can exist without any Deploy (created from an event's `environment` tag).
- The `ActivityType.DEPLOY` row is an activity/notification record, not an ingested Event. I found no Event subclass or event type named `deployment` in Sentry's `src/sentry/eventtypes/` tree (which contains error, feedback, generic, nel, security, transaction).
- "Deployment event" in third-party/agent skills language appears to be informal wording for a recorded Deploy (API/CLI call). It is not an official Sentry entity name in the primary sources reviewed.

### Gaps
- I found no primary-source definition of an Event type literally named `deployment`, and no SDK API that creates a Deploy by capturing such an event. Search of Sentry docs and the `eventtypes` source tree returned nothing. Report this as "not found", not as proven impossible.
- Sentry CLI source paths for `deploys new` were not confirmed (404 on the guessed GitHub paths); the CLI command forms are taken from official docs.

## Q4. What is the difference between Release, Deploy, Deployment event, and Environment? Give exact definitions with source lines.

### Takeaway
Release = a version of code (org-scoped, linked to projects). Deploy = the act/record of putting that release into an environment (with times, name, URL). Environment = an org-scoped tag value used to filter data; it is not a version and not a deploy. "Deployment event" has no official definition in the sources found.

### Cited Findings
- Release definition (exact quote): "A *release* is a version of your code deployed to an environment." — [Releases](https://docs.sentry.io/product/releases/)
- Release source docstring: "A release is generally created when a new version is pushed into a production state." Source fields: `organization` FK, `projects` M2M, `version`, `date_added`, `date_released`, `total_deploys`, `last_deploy_id`; `unique_together = (("organization", "version"),)` — [release.py L243–L315](https://github.com/getsentry/sentry/blob/master/src/sentry/models/release.py#L243)
- "Releases are global per organization. If you want the releases in different projects to be treated as separate entities, make the version name unique across the organization." — [Release Management](https://docs.sentry.io/cli/releases/)
- "Each release links to one or more projects. If a release has multiple projects, Sentry will duplicate the release data in relation to each one." — [Releases](https://docs.sentry.io/product/releases/)
- "Typically, a release = a deployment, but if you have several environments in which you want to deploy a release, this step also allows you to create those deployments individually." — [Set Up Releases](https://docs.sentry.io/product/releases/setup/#4-notify-sentry)
- Environment definition (exact quote): "`Environment` is a Sentry-supported tag that you can (and should) add to your SDK. Generally, the tag accepts any value, but it's intended to refer to your code deployments' naming convention, such as *development*, *testing*, *staging*, or *production*." — [Creating and Filtering Environments](https://docs.sentry.io/concepts/key-terms/environments/)
- Release/Environment/Deploy relation (exact quote): "A release by itself is not associated with an environment but can be deployed to different environments. When you select an environment on the releases page, it shows releases that were deployed to that environment. ... A deploy must have an environment." — [Environments / Releases](https://docs.sentry.io/concepts/key-terms/environments/#releases)
- "Environments are unique to each organization. Environment settings, however, are defined per project since you can hide environments per project." and "Sentry automatically creates environments when it receives an event with the environment tag." — [Creating and Filtering Environments](https://docs.sentry.io/concepts/key-terms/environments/)
- Environment naming rules: case-sensitive; no newlines, spaces, forward slashes; not the string "None"; max 64 characters; "You cannot delete environments, but you can hide them." — [Environment Naming Requirements](https://docs.sentry.io/concepts/key-terms/environments/#environment-naming-requirements)
- Environment source: `organization_id`, `projects` M2M through `EnvironmentProject`, `name`, `date_added`, `unique_together = (("organization_id", "name"),)`; `EnvironmentProject` has `is_hidden` — [environment.py L30–L57](https://github.com/getsentry/sentry/blob/master/src/sentry/models/environment.py#L30)
- Finalizing a release is separate from deploying: "Finalizing a release means that we populate a second timestamp on the release record ... `sentry-cli releases finalize VERSION`" — [Finalizing Releases](https://docs.sentry.io/cli/releases/#finalizing-releases)
- Deploy vs Release discussion exists as an open Sentry docs issue, "Difference between deploy and release? #6301" — [sentry-docs issue 6301](https://github.com/getsentry/sentry-docs/issues/6301)

### Inferences
- Release and Environment are orthogonal dimensions: a Release is a version string per org; an Environment is a tag value per org. The Deploy entity joins them with time data.
- Deploys cannot be deleted through the documented CLI, while Releases can be deleted via the API (delete endpoints are listed under Releases). This supports treating Deploy as an append-only deployment record.
- "Deployment event" should not be used as a synonym for Release or Environment in specs; use "Deploy" for the Sentry entity.

### Gaps
- No authoritative primary-source definition of "Deployment event" was found. Sentry docs consistently use "deploy" (CLI/API) and "Release"/"Environment" as defined above.

## Q5. Which REST API endpoints create/list Projects, Project keys/DSNs and deployments? Give exact paths and request fields.

### Takeaway
Projects are created and listed under `/api/0/organizations/{org}/projects/`; client keys (DSNs) live under `/api/0/projects/{org}/{project}/keys/`; deploys live under `/api/0/organizations/{org}/releases/{version}/deploys/`. All use bearer auth tokens with scoped permissions.

### Cited Findings
- `GET /api/0/organizations/{organization_id_or_slug}/projects/` — "Return a list of projects bound to a organization." Query params: `cursor`, `per_page` (default and max 100), `query` (filter by name or slug), `collapse` (`latestDeploys`, `unusedFeatures`). Scopes: `org:admin`, `org:read`, `org:write`. — [List an Organization's Projects](https://docs.sentry.io/api/organizations/list-an-organizations-projects/)
- `POST /api/0/organizations/{organization_id_or_slug}/projects/` — "Create a new project for an organization." Body: `name` (REQUIRED), `slug` ("Uniquely identifies a project and is used for the interface. If not provided, it is automatically generated from the name."), `platform`, `default_rules` (boolean, defaults true). Scopes: `project:admin`, `project:read`, `project:write`. Note in docs: personal team created and bound; org setting `disable_member_project_creation` requires `org:write`. — [Create a Project for an Organization](https://docs.sentry.io/api/projects/create-a-project-for-an-organization/)
- `POST /api/0/projects/{organization_id_or_slug}/{project_id_or_slug}/keys/` — "Create a new client key bound to a project. The key's secret and public key are generated by the server." Body: `name` (optional), `rateLimit` (`{window, count}` or null), `useCase` (`user`, `profiling`, `tempest`, `demo`). Scopes: `project:admin`, `project:write`. — [Create a New Client Key](https://docs.sentry.io/api/projects/create-a-new-client-key/)
- `GET /api/0/projects/{organization_id_or_slug}/{project_id_or_slug}/keys/` — "Return a list of client keys bound to a project." Query: `cursor`, `status` (`active` / `inactive`). Scopes: `project:admin`, `project:read`, `project:write`. — [List a Project's Client Keys](https://docs.sentry.io/api/projects/list-a-projects-client-keys/)
- `GET /api/0/organizations/{organization_id_or_slug}/dsn-lookup/?dsn=<dsn>` — "Return the project and client key that a DSN belongs to." Scopes: `org:admin`, `org:read`, `org:write` — [Resolve a DSN to Its Project](https://docs.sentry.io/api/projects/resolve-a-dsn-to-its-project/)
- `POST /api/0/organizations/{organization_id_or_slug}/releases/{version}/deploys/` — "Create a deploy for a given release." Body: `environment` (REQUIRED, string), `name`, `url`, `dateStarted`, `dateFinished` ("If not provided, the current time is used."), `projects` (array of project slugs; "If not provided, deploys are created for all of the release's projects."). Scopes: `org:ci`, `project:admin`, `project:releases`, `project:write`. Response 201. — [Create a Deploy](https://docs.sentry.io/api/releases/create-a-deploy/)
- `GET /api/0/organizations/{organization_id_or_slug}/releases/{version}/deploys/` — "Returns a list of deploys based on the organization, version, and project." Query: `cursor`. Scopes: `org:ci`, `project:admin`, `project:read`, `project:releases`, `project:write`. — [List a Release's Deploys](https://docs.sentry.io/api/releases/list-a-releases-deploys/)
- `POST /api/0/projects/{organization_id_or_slug}/{project_id_or_slug}/teams/{team_id_or_slug}/` — "Give a team access to a project." — [Add a Team to a Project](https://docs.sentry.io/api/projects/add-a-team-to-a-project/)
- `GET /api/0/projects/{organization_id_or_slug}/{project_id_or_slug}/` — "Return details on an individual project." — [Retrieve a Project](https://docs.sentry.io/api/projects/retrieve-a-project/)
- Environment endpoints exist but are not create endpoints: "List a Project's Environments", "List an Organization's Environments", "Retrieve a Project Environment", "Update a Project Environment", "Bulk Update Project Environments" — [Environments API index](https://docs.sentry.io/api/environments/)
- Source confirmation of create-deploy validation: `environment` max length 64; `deploy_created.send_robust(...)`; `Release.objects.filter(id=release.id).update(total_deploys=F("total_deploys") + 1, last_deploy_id=deploy.id)` — [release_deploys.py](https://github.com/getsentry/sentry/blob/master/src/sentry/releases/endpoints/release_deploys.py)

### Inferences
- API paths use organization id-or-slug and project id-or-slug, so a client does not need the numeric id to call them; the numeric id is required only when constructing a DSN (which Sentry generates).
- Create-deploy accepts `projects` as slugs (the serializer uses `ProjectField(..., id_allowed=True)`), but docs describe slugs; passing ids is implementation tolerance, not the documented contract.
- There is no documented REST endpoint to delete a Deploy; CLI docs also state deploys cannot be deleted.

### Gaps
- The full JSON response schema for the deploy endpoints is generated by the docs site and was not returned as literal text through the fetch tool; the field list is taken from the source serializer and API docs parameters.

## Q6. Are project ids numeric and assigned by Sentry, or user-chosen? Can a user pick a specific numeric id?

### Takeaway
Project ids are **numeric, Sentry-assigned** bigint primary keys. A user chooses the project `name` and optionally the `slug`; there is no documented request field for the numeric id, and no source path that lets the caller set it.

### Cited Findings
- Source: `class Model(BaseModel): id = BoundedBigAutoField(primary_key=True)` — the base for `Project` — [base.py L324–L325](https://github.com/getsentry/sentry/blob/master/src/sentry/db/models/base.py#L324)
- `class Project(Model)` with `slug`, `name`, `organization`, `teams` fields; `id` is inherited from `Model`, not user-supplied — [project.py L247–L262](https://github.com/getsentry/sentry/blob/master/src/sentry/models/project.py#L247)
- Create-project request fields are only `name`, `slug`, `platform`, `default_rules` — [Create a Project for an Organization](https://docs.sentry.io/api/projects/create-a-project-for-an-organization/)
- Docs example of assigned project id: `"id": "6758470122493650"` in a create response and `"projectId": 4505281256090153` in a key response — [Create a Project for an Organization](https://docs.sentry.io/api/projects/create-a-project-for-an-organization/), [List a Project's Client Keys](https://docs.sentry.io/api/projects/list-a-projects-client-keys/)
- `slug` is user-settable and auto-generated if omitted: "Uniquely identifies a project and is used for the interface. If not provided, it is automatically generated from the name." — [Create a Project for an Organization](https://docs.sentry.io/api/projects/create-a-project-for-an-organization/)
- Client-key public/secret values are also server-generated: "The key's secret and public key are generated by the server." — [Create a New Client Key](https://docs.sentry.io/api/projects/create-a-new-client-key/)
- On legacy self-hosted Sentry, DSN example uses small id `1`; modern SaaS uses large 64-bit-style ids — compare [DSN explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/) with [List a Project's Client Keys](https://docs.sentry.io/api/projects/list-a-projects-client-keys/). This is an example difference, not proof of a product rule change.

### Inferences
- Because `id` is an auto field and is absent from create request fields, a user cannot pick a specific numeric Project id through the documented API. The slug is the user-chosen stable identifier.
- Numeric ids are large in modern SaaS (e.g., 4505281256090153); code must not assume 32-bit integers.

### Gaps
- No primary source explicitly states "users cannot choose the numeric id" as a policy sentence. The conclusion is an inference from the auto-increment source field and the API request schema.
- No source was found describing whether a Sentry administrator can override a project id by direct database manipulation; that is outside documented product behavior and is not recommended.
