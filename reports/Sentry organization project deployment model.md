# Map Sentry's four-layer hierarchy before refactoring

Sentry stores the four objects your team wants to copy, but the exact shape differs from "Users <-> Orgs -> Projects -> Deployments". The real chain is User <-> Organization through a membership row, Organization -> Project through a foreign key, and Organization -> Release -> Deploy with Environment as a separate tag. A Team layer sits between membership and project and takes part in project ownership. The User <-> Organization relation is many-to-many; the Organization -> Project relation is one-to-many; a Deploy has no direct foreign key to a Project, and the deploy API targets projects through a `projects` body field ([OrganizationMember model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organizationmember.py), [Project model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/project.py), [deploy.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/deploy.py)). A refactor that copies the four-layer chain literally will add a Project -> Deploy link that Sentry does not have. To mirror Sentry, keep the many-to-many membership, add the Team layer, store the role on the membership, and place Deploy under Release and Environment.

## Four layers form the chain, and a team layer sits inside it

The explicit flow, with cardinality, is shown below. The arrow direction follows the foreign key or join table.

```
User <-(M2M: OrganizationMember)-> Organization
OrganizationMember <-(M2M: OrganizationMemberTeam)-> Team
Organization -(1:M)-> Team            [Team.organization FK]
Organization -(1:M)-> Project         [Project.organization FK]
Project <-(M2M: ProjectTeam)-> Team
Organization -(1:M)-> Release         [Release.organization FK]
Release <-(M2M)-> Project             [Release.projects]
Release -(1:M)-> Deploy               [Deploy.release FK]
Deploy -(M:1)-> Environment           [Deploy.environment_id]
Organization -(1:M)-> Environment     [Environment.organization_id]
```

Sentry defines an Organization as "a group of individuals which maintain ownership of projects" ([Organization model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organization.py)). The User <-> Organization link is a many-to-many relation through `OrganizationMember`: one row per (organization, user) pair, with the `role` stored on the membership and not on the User ([OrganizationMember model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organizationmember.py)). Access uses only this table; `OrganizationManager.get_for_user` queries `OrganizationMember.objects.filter(user_id=user.id)` ([Organization model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organization.py)). One user can belong to several organizations, and deleting an organization does not delete user accounts ([Remove an Organization](https://docs.sentry.io/organization/membership/#remove-an-organization)). A Team belongs to one Organization through `Team.organization`, and a Project belongs to exactly one Organization through `Project.organization` ([Team model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/team.py), [Project model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/project.py)). A Project can belong to many Teams through `ProjectTeam` ([projectteam.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/projectteam.py)).

Teams are not optional in the current API. New projects can only be created and owned by teams where the user is Team Admin, and the create-project endpoint auto-creates a personal team (`team-{username}`) when none is chosen ([Add a Member to an Organization](https://docs.sentry.io/api/organizations/add-a-member-to-an-organization/), [Create a Project for an Organization](https://docs.sentry.io/api/projects/create-a-project-for-an-organization/)). Project access follows team membership: "Projects can only be accessed by that project's team(s)", and any org member can gain access by joining the associated team ([Project access and team membership](https://docs.sentry.io/organization/membership/#project-access-and-team-membership)). When a user holds several roles, "a union of those permissions is applied" ([Membership](https://docs.sentry.io/organization/membership/)).

**Inference flagged:** Sentry has no documented sentence that states "a project must have at least one team". The requirement is inferred from the create-project endpoint and the access rules; no schema constraint that forbids zero teams was found. **Inference flagged:** Team membership is optional for a member (`has_global_access` defaults to `True`), but not optional for a Project in the current API. **Inference flagged:** Single-organization mode is a deployment setting (`SENTRY_SINGLE_ORGANIZATION = True` in self-hosted), not a schema limit; the core default is `False` ([sentry.conf.example.py](https://github.com/getsentry/self-hosted/blob/master/sentry/sentry.conf.example.py), [server.py](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py)).

### Relation types at a glance

| Relation | Type | Sentry mechanism |
| --- | --- | --- |
| User <-> Organization | many-to-many | `sentry_organizationmember` join row |
| OrganizationMember <-> Team | many-to-many | `OrganizationMemberTeam` (`is_active`, `role`) |
| Organization -> Team | one-to-many | `Team.organization` FK |
| Organization -> Project | one-to-many | `Project.organization` FK |
| Project <-> Team | many-to-many | `ProjectTeam` (unique per project, team) |
| Organization -> Release | one-to-many | `Release.organization` FK |
| Release <-> Project | many-to-many | `Release.projects` |
| Release -> Deploy | one-to-many | `Deploy.release` FK |
| Deploy -> Environment | many-to-one | `Deploy.environment_id` |
| Organization -> Environment | one-to-many | `Environment.organization_id` |
| Project -> Deploy | **no direct relation** | only via Release and the `projects` field on the deploy endpoint |

## Numeric ids and unique slugs identify every entity

Each entity has a numeric primary key plus a human-readable name or slug. New Organization, Team, and Project rows use snowflake ids; older rows show small integers ([version and source notes](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organization.py)). API path parameters accept either form and are named `organization_id_or_slug` and `project_id_or_slug` ([Retrieve an Organization](https://docs.sentry.io/api/organizations/retrieve-an-organization/), [Retrieve a Project](https://docs.sentry.io/api/projects/retrieve-a-project/)). In JSON, an id can appear as a string (`"id": "4505278496"`) or as a number (`"projectId": 4505281256090153`); treat it as an opaque numeric value ([Retrieve a Project](https://docs.sentry.io/api/projects/retrieve-a-project/), [List a Project's Client Keys](https://docs.sentry.io/api/projects/list-a-projects-client-keys/)). The slug is user-settable and auto-generated from the name when omitted ([Create a Project for an Organization](https://docs.sentry.io/api/projects/create-a-project-for-an-organization/)).

| Entity (model) | Id / identifier | Key fields | Source |
| --- | --- | --- | --- |
| User (`auth_user`) | `id` numeric PK; `username` unique, normally the email | `email`, `name` (DB column `first_name`), `is_staff`, `is_active`, `is_superuser`, `is_managed`, `is_suspended`, `date_joined` | [user.py](https://github.com/getsentry/sentry/blob/master/src/sentry/users/models/user.py) |
| Organization | `id` snowflake/auto bigint; `slug` unique | `name` (max 64), `status`, `date_added`, `default_role`; decorated `@snowflake_id_model` | [organization.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organization.py) |
| OrganizationMember | own numeric `id` | `organization` FK, `user_id` (nullable), `email`, `role` (CharField 32), `teams` M2M, `invite_status`, `token`, `token_expires_at`, `has_global_access`, `flags`; unique on (organization, user) and (organization, email) | [organizationmember.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organizationmember.py) |
| Team | `id`; `slug` unique per organization | `organization` FK, `status` (ACTIVE / PENDING_DELETION / DELETION_IN_PROGRESS) | [team.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/team.py) |
| OrganizationMemberTeam | numeric PK | `team` FK, `organizationmember` FK, `is_active`, `role` (nullable); unique on (team, member) | [organizationmemberteam.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organizationmemberteam.py) |
| Project | `id` from `BoundedBigAutoField`; `slug` unique per organization | `name`, `organization` FK, `teams` M2M through `ProjectTeam` | [project.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/project.py), [base.py](https://github.com/getsentry/sentry/blob/master/src/sentry/db/models/base.py) |
| ProjectTeam | join row | `project` FK, `team` FK; unique on (project, team) | [projectteam.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/projectteam.py) |
| Release | `id`; `version` | `organization` FK, `projects` M2M, `date_added`, `date_released`, `total_deploys`, `last_deploy_id`; unique on (organization, version) | [release.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/release.py) |
| Deploy (`sentry_deploy`) | `id` | `organization_id`, `release` FK, `environment_id`, `date_started`, `date_finished`, `name` (max 64), `url`, `notified` | [deploy.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/deploy.py) |
| Environment | `id`; `name` | `organization_id`, `projects` M2M through `EnvironmentProject` (`is_hidden`); unique on (organization_id, name) | [environment.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/environment.py) |
| Client key / DSN | `public` = 32 hex chars; `secret` server-generated | `projectId` numeric; DSN = `{PROTOCOL}://{PUBLIC_KEY}:{SECRET_KEY}@{HOST}{PATH}/{PROJECT_ID}` | [dsn-explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/), [Create a New Client Key](https://docs.sentry.io/api/projects/create-a-new-client-key/) |

A user cannot choose the numeric Project id; the create request only accepts `name`, `slug`, `platform`, and `default_rules` ([Create a Project for an Organization](https://docs.sentry.io/api/projects/create-a-project-for-an-organization/)). **Inference flagged:** this is inferred from the auto-increment field and the request schema, not from a policy sentence. **Inference flagged:** code must not assume 32-bit integers, because modern SaaS ids are large. **Gap flagged:** no primary source confirms whether slugs are case-insensitive at the database level; the unique constraint is on the raw slug. **Gap flagged:** no source states a maximum number of teams per project, and no source was found that lets a user set the numeric Project id.

## Roles govern people, and scopes govern tokens

Sentry separates two permission layers. Roles are organization-level or team-level and apply to people; scopes are colon-delimited strings on API tokens ([Membership](https://docs.sentry.io/organization/membership/), [Permissions & Scopes](https://docs.sentry.io/api/permissions/)). Organization roles are Billing, Member, Admin, Manager, and Owner. Source ids are `member`, `admin`, `manager`, `owner`, plus team roles `contributor` and `admin` (Team Admin); the default role is `member`, and the top role is Owner ([server.py](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py)). Org Admin (`admin`) is marked `is_retired: True` in source and cannot be assigned on Business or Enterprise plans ([Membership](https://docs.sentry.io/organization/membership/#organization-level-roles)).

| Role | Source id | Create / remove projects for org | Add projects to teams | Create teams | Change org settings | Transfer project to another org |
| --- | --- | --- | --- | --- | --- | --- |
| Billing | `billing` | no | no | no | no | no |
| Org Member | `member` | yes (see note) | no | no | no | no |
| Org Admin (legacy) | `admin` | yes | no | yes | no | no |
| Org Manager | `manager` | yes | yes | yes | yes | no |
| Org Owner | `owner` | yes | yes | yes | yes | yes |
| Team Contributor | `contributor` | no | no | no | no | no |
| Team Admin | `admin` (team) | yes, for administered teams | no | no | no | no |

The Member footnote is important for the refactor: on Business and Enterprise plans any org member can create a project, and that member becomes Team Admin for the project by default ([Permissions](https://docs.sentry.io/organization/membership/#permissions), [Team permissions](https://docs.sentry.io/organization/membership/#permissions-1)). Only Managers and Owners can add or remove projects for teams, and only Owners can transfer a project to another organization ([Membership](https://docs.sentry.io/organization/membership/)).

Scopes use a `<resource>:<action>` triad plus special-purpose values. The canonical set in `server.py` includes `org:read/write/admin/integrations/ci/tokens`, `member:invite/read/write/admin`, `team:read/write/admin`, `project:read/write/admin/releases/distribution`, `event:read/write/admin`, `alerts:read/write`, `dashboard:read/write`, `membership:read`, `saved_query:read/write`, `seer:read/write`, `service_account:read/write`, `user_preference:read/write`, `openid`, `profile`, and `email` ([server.py](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py), [apiscopes.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/apiscopes.py)). Project creation needs `project:write` or `project:admin`, or `org:write` when member project creation is disabled ([Create a New Project](https://docs.sentry.io/api/projects/create-a-new-project/)). Deploy creation accepts `org:ci`, `project:admin`, `project:releases`, or `project:write` ([Create a Deploy](https://docs.sentry.io/api/releases/create-a-deploy/)). Reading events uses `event:read` ([Permissions & Scopes](https://docs.sentry.io/api/permissions/)).

Three main token types exist. Organization Tokens are org-bound, have a fixed limited scope set, and work in CI and Sentry CLI; any user can create one, but only owners and managers can revoke it. Internal Integrations are org-bound with customizable, editable permissions and are the token to use for programmatic project creation. Personal Tokens are user-bound; their maximum scope is the user's own role scope for that organization, and their permissions cannot be edited later ([Auth Tokens](https://docs.sentry.io/account/auth-tokens/)). OAuth2 tokens expire after 30 days, DSN auth uses `Authorization: DSN {DSN}`, and legacy API keys use Basic auth ([API Authentication](https://docs.sentry.io/api/auth/)). Token prefixes include `sntryu_` for personal tokens and `sntrys_` for organization tokens ([Token formats](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py), [Token and Credential Formats](https://docs.sentry.io/security-legal-pii/security/token-formats/)). The DSN is public and write-only: "DSNs are safe to keep public because they only allow submission of new events and related event data" ([DSN explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/)).

**Inference flagged:** effective token access is the intersection of binding and scope set. **Inference flagged:** `org:ci` is the preferred deploy scope because it is limited to CI workflows. **Inference flagged:** a personal token can create releases for projects whose teams the user is not in, but updates, deletes, and deploys still require access to all projects of the release ([Permissions & Scopes](https://docs.sentry.io/api/permissions/)). **Gap flagged:** the exact fixed scope set of an Organization Token is not enumerated in the docs pages fetched. **Gap flagged:** `SENTRY_SCOPE_HIERARCHY_MAPPING` in `server.py` was not transcribed in full. **Gap flagged:** the exact team-role-to-constant mapping is only partially transcribed.

## REST paths follow the ownership chain

The URL hierarchy mirrors ownership: `/organizations/{org}/projects/`, `/projects/{org}/{project}/keys/`, and `/organizations/{org}/releases/{version}/deploys/` ([API Authentication](https://docs.sentry.io/api/auth/)). All Bearer examples use `Authorization: Bearer <token>`.

| Method and path | Purpose | Key request fields | Scopes | Source |
| --- | --- | --- | --- | --- |
| `GET /api/0/organizations/` | List your organizations | none | — | [List Your Organizations](https://docs.sentry.io/api/users/list-your-organizations/) |
| `GET /api/0/organizations/{organization_id_or_slug}/` | Retrieve an organization | query `detailed` | `org:admin`, `org:read`, `org:write` | [Retrieve an Organization](https://docs.sentry.io/api/organizations/retrieve-an-organization/) |
| `POST /api/0/organizations/` | Create an organization | `name` | — | [third-party client](https://github.com/atlassian/go-sentry-api/blob/master/organization.go) |
| `POST /api/0/organizations/{org}/members/` | Add or invite a member | `email` (required), `orgRole` (`billing`/`member`/`manager`/`owner`/`admin`), `teamRoles` (`contributor`/`admin`), `sendInvite`, `reinvite`, `regenerate`; `role` and `teams` are deprecated | `member:admin`, `member:invite`, `member:write` | [Add a Member](https://docs.sentry.io/api/organizations/add-a-member-to-an-organization/) |
| `GET /api/0/organizations/{org}/members/` | List members | none | — | [List Members](https://docs.sentry.io/api/organizations/list-an-organizations-members/) |
| `DELETE /api/0/organizations/{org}/members/{member_id}/` | Remove a member | `member_id` in path | `member:admin`, `member:read`, `member:write` | [Delete Member](https://docs.sentry.io/api/organizations/delete-an-organization-member/) |
| `GET /api/0/organizations/{org}/projects/` | List organization projects | `cursor`, `per_page` (max 100), `query`, `collapse` | `org:admin`, `org:read`, `org:write` | [List Projects](https://docs.sentry.io/api/organizations/list-an-organizations-projects/) |
| `POST /api/0/organizations/{org}/projects/` | Create project for organization | `name` (required), `slug`, `platform`, `default_rules` | `project:admin`, `project:read`, `project:write` | [Create Project for an Organization](https://docs.sentry.io/api/projects/create-a-project-for-an-organization/) |
| `POST /api/0/teams/{org}/{team}/projects/` | Create project bound to a team | same as above; `org:write` or Team Admin if member creation disabled | `project:admin`, `project:write` | [Create a New Project](https://docs.sentry.io/api/projects/create-a-new-project/) |
| `GET /api/0/projects/{org}/{project}/keys/` | List client keys | `cursor`, `status` | `project:admin`, `project:read`, `project:write` | [List Client Keys](https://docs.sentry.io/api/projects/list-a-projects-client-keys/) |
| `POST /api/0/projects/{org}/{project}/keys/` | Create client key | `name`, `rateLimit` (`window`/`count`), `useCase` | `project:admin`, `project:write` | [Create a New Client Key](https://docs.sentry.io/api/projects/create-a-new-client-key/) |
| `GET /api/0/organizations/{org}/dsn-lookup/?dsn=...` | Resolve DSN to project | `dsn` | `org:admin`, `org:read`, `org:write` | [Resolve a DSN](https://docs.sentry.io/api/projects/resolve-a-dsn-to-its-project/) |
| `POST /api/0/projects/{org}/{project}/teams/{team}/` | Give a team access to a project | ids in path | — | [Add a Team to a Project](https://docs.sentry.io/api/projects/add-a-team-to-a-project/) |
| `POST /api/0/organizations/{org}/releases/{version}/deploys/` | Create a deploy | `environment` (required), `name`, `url`, `dateStarted`, `dateFinished`, `projects` (array of slugs) | `org:ci`, `project:admin`, `project:releases`, `project:write` | [Create a Deploy](https://docs.sentry.io/api/releases/create-a-deploy/) |
| `GET /api/0/organizations/{org}/releases/{version}/deploys/` | List deploys | `cursor` | `org:ci`, `project:admin`, `project:read`, `project:releases`, `project:write` | [List Deploys](https://docs.sentry.io/api/releases/list-a-releases-deploys/) |

**Gap flagged:** public REST docs omit a "Create an Organization" page; the `POST /api/0/organizations/` evidence is a third-party client, not a primary Sentry source. **Gap flagged:** the body fields of "Update an Organization Member's Roles" were not retrieved. **Inference flagged:** `project:read` on the org-level create-project endpoint is unusual; treat create as write and verify against live behavior. **Gap flagged:** no version-difference note was found for the REST endpoints fetched.

## Releases and environments sit between projects and deploys

This is the main correction to the requested flow. In Sentry, Deploy is a first-class entity with its own table (`sentry_deploy`), but it does not carry a Project foreign key. Its fields are `organization_id`, `release`, `environment_id`, `date_started`, `date_finished`, `name`, `url`, and `notified`; creation also increments `Release.total_deploys` and sets `last_deploy_id` ([deploy.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/deploy.py), [release_deploys.py](https://github.com/getsentry/sentry/blob/master/src/sentry/releases/endpoints/release_deploys.py)). Release is organization-scoped and links to many projects through `Release.projects` ([release.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/release.py)). The create-deploy endpoint takes `projects` as an array of project slugs; when the field is absent, "deploys are created for all of the release's projects" ([Create a Deploy](https://docs.sentry.io/api/releases/create-a-deploy/)). So the Project -> Deploy relation is indirect, through Release, and it is not a stored foreign key.

A Release is "a version of your code deployed to an environment" ([Releases](https://docs.sentry.io/product/releases/)). Releases are global per organization, and a version string must be unique across the organization for projects to be treated as separate entities ([Release Management](https://docs.sentry.io/cli/releases/)). An Environment is an org-scoped tag value, often `development`, `testing`, `staging`, or `production`; Sentry creates it automatically when it receives an event with the `environment` tag ([Environments](https://docs.sentry.io/concepts/key-terms/environments/)). "A deploy must have an environment" ([Environments / Releases](https://docs.sentry.io/concepts/key-terms/environments/#releases)). There is no documented REST endpoint to delete a Deploy, and the CLI states that deploys cannot be deleted, so treat Deploy as append-only ([Create a Deploy](https://docs.sentry.io/api/releases/create-a-deploy/), [CLI releases](https://docs.sentry.io/cli/releases/)). "Deployment event" has no official definition in the primary sources; use "Deploy" as the entity name ([Releases](https://docs.sentry.io/product/releases/)).

**Inference flagged:** one Release can have many Deploys, one per environment or repeated over time. **Inference flagged:** Deploy joins the orthogonal Release (version) and Environment (tag) dimensions with time data. **Inference flagged:** `ActivityType.DEPLOY` rows are activity and notification records, not ingested Events; no Event type named `deployment` was found in `src/sentry/eventtypes/`. **Gap flagged:** report "Event type `deployment` not found" as a search result, not as proof that it cannot exist. **Gap flagged:** no primary-source definition of "Deployment event" was found. **Gap flagged:** Sentry CLI source paths for `deploys new` were not confirmed. **Gap flagged:** the full JSON response schema for the deploy endpoints was not returned as literal text; the field list comes from the source serializer ([deploy serializer](https://github.com/getsentry/sentry/blob/master/src/sentry/api/serializers/models/deploy.py)). **Inference flagged:** the `projects` field on create-deploy accepts slugs; passing ids is implementation tolerance, not the documented contract.

### Bootstrap and registration for the refactor

Self-hosted setup runs `./install.sh`, then `docker compose up --wait`; the login page is at `http://127.0.0.1:9000` ([Self-Hosted Sentry](https://develop.sentry.dev/self-hosted/#getting-started)). The first user is created during install or with the CLI `createuser --superuser` command ([createuser command source](https://github.com/getsentry/sentry/blob/master/src/sentry/runner/commands/createuser.py)). In single-organization mode, that user becomes Owner of the default organization; superusers have full access across all organizations, and the install script has a `--skip-user-creation` flag ([createuser command source](https://github.com/getsentry/sentry/blob/master/src/sentry/runner/commands/createuser.py), [self-hosted issue #1721](https://github.com/getsentry/self-hosted/issues/1721)). Public registration is gated by the feature `auth:register` and the option `auth.allow-registration`, which defaults to `False`; this gate does not block SSO or invite-based registration ([Backend Configuration, Authentication](https://develop.sentry.dev/config/#authentication), [options/defaults.py](https://github.com/getsentry/sentry/blob/master/src/sentry/options/defaults.py)). **Inference flagged:** the first user becoming the first org owner should be an explicit bootstrap step in a mirror, with registration allow/deny kept separate from adding members. **Gap flagged:** the exact container invocation (`docker compose run --rm web createuser ...`) is not confirmed from primary docs. **Gap flagged:** the exact syntax to set `auth.allow-registration` in `config.yml` versus `SENTRY_OPTIONS` in `sentry.conf.py` was not confirmed.

## Inference and gap register

The table below lists every inference and gap recorded in the three source notes. Nothing in this report should be read as a confirmed Sentry fact when it appears here.

| Source note | Type | Flagged item |
| --- | --- | --- |
| auth_scopes.md | Inference | Scope has two parts: binding (org, user, or DSN) and scope set; effective access is their intersection. |
| auth_scopes.md | Inference | Internal integrations are the only token type with fully customizable, editable org-bound permissions. |
| auth_scopes.md | Inference | DSN auth is an exception to Bearer auth and works only on documented endpoints. |
| auth_scopes.md | Gap | Exact fixed scope set of an Organization Token is not enumerated. |
| auth_scopes.md | Inference | The model uses a read/write/admin triad per resource plus special scopes. |
| auth_scopes.md | Inference | A mirror can give each resource a scope prefix, require `:write` for create and `:admin` for delete. |
| auth_scopes.md | Inference | `org:ci` is the preferred deploy/CI scope. |
| auth_scopes.md | Gap | `SENTRY_SCOPE_HIERARCHY_MAPPING` in `server.py` was not transcribed in full. |
| auth_scopes.md | Inference | The DSN is a project-scoped write-only capability; the server resolves the key. |
| auth_scopes.md | Inference | A mirror can issue public write-only ingestion keys per project and keep a separate authenticated read path. |
| auth_scopes.md | Inference | Event submission is not covered by the API scope system. |
| auth_scopes.md | Gap | Exact server-side DSN parsing code was not fetched. |
| auth_scopes.md | Inference | Roles are the human layer; scopes are the token layer; personal token scopes are constrained by role. |
| auth_scopes.md | Inference | Create-project permission is tied to team ownership, not to a global deploy role. |
| auth_scopes.md | Inference | On self-hosted, expect the Manager/Owner plus Team Admin model. |
| auth_scopes.md | Gap | Exact team-level role-to-constant mapping and full per-role scopes are only partially transcribed. |
| auth_scopes.md | Inference | URL hierarchy mirrors the ownership hierarchy. |
| auth_scopes.md | Inference | Deploy is an org-level endpoint that targets a subset of projects via `projects`. |
| auth_scopes.md | Inference | `project:read` on the org-level create-project endpoint is unusual; verify against live behavior. |
| auth_scopes.md | Gap | No version-difference note was found for the REST endpoints fetched. |
| auth_scopes.md | Inference | The precise registration gate is `auth.allow-registration` AND the `auth:register` feature. |
| auth_scopes.md | Inference | First-user creation is interactive; automate with `--skip-user-creation` plus `createuser --superuser`. |
| auth_scopes.md | Inference | Version difference: the 2016 flag differs from the current option. |
| auth_scopes.md | Gap | Exact syntax to set `auth.allow-registration` in `config.yml` versus `SENTRY_OPTIONS` was not confirmed. |
| org_users.md | Inference | Many-to-many User <-> Organization is explicit; one row per (org, user); role on membership. |
| org_users.md | Inference | A Project has one Organization FK and many Teams; projects cannot span organizations. |
| org_users.md | Inference | Team membership is optional for a member (`has_global_access` default true) but not for a Project in the current API. |
| org_users.md | Inference | Mirror model: User -> OrganizationMember -> Organization; -> OrganizationMemberTeam -> Team; Organization -> Project <- ProjectTeam -> Team. |
| org_users.md | Gap | No explicit doc sentence states "a project must have at least one team"; no schema constraint was found. |
| org_users.md | Inference | Keep a numeric surrogate key plus a unique URL-safe slug. |
| org_users.md | Inference | No separate public Organization code or tenant short name exists beyond the slug. |
| org_users.md | Gap | Slug case-insensitivity at the database level was not verified. |
| org_users.md | Inference | `role` belongs on the membership; team role on the join row; invite metadata on the membership. |
| org_users.md | Inference | `admin` is a legacy org role; model Owner, Manager, Member, Billing, Team Admin, Contributor and skip Org Admin. |
| org_users.md | Gap | No documented limit on the number of owners per organization. |
| org_users.md | Gap | The exact release that retired Org Admin is not stated. |
| org_users.md | Inference | Bootstrap: install, wizard, start services, create first user, become Owner, close registration, add users by invite or SSO. |
| org_users.md | Gap | The exact `docker compose run ... createuser` command is unverified from primary docs. |
| org_users.md | Gap | Version difference: `auth:register` (2016) versus `auth.allow-registration` (current). |
| org_users.md | Inference | The data model is multi-tenant; Organization is the tenant root. |
| org_users.md | Inference | Single-org mode is a deployment option, not a schema limit. |
| org_users.md | Gap | Exact behavior or limits when `SENTRY_SINGLE_ORGANIZATION = False` were not found. |
| org_users.md | Inference | Access pattern: `/api/0/organizations/{idOrSlug}` is the tenant root; membership is a subresource. |
| org_users.md | Inference | Make `orgRole` current; keep `role`/`teams` as deprecated aliases; make `teamRoles` current. |
| org_users.md | Inference | DELETE by member ID confirms membership is its own resource. |
| org_users.md | Gap | `POST /api/0/organizations/` request schema is not confirmed from a primary source. |
| org_users.md | Gap | Body fields of "Update an Organization Member's Roles" were not retrieved. |
| project_deployments.md | Inference | DSN parts: scheme = protocol; userinfo = public key plus optional secret; host = ingest endpoint; path = numeric `Project.id`. |
| project_deployments.md | Inference | Numeric id is a bigint assigned by Sentry; the slug is human-readable; API paths accept both. |
| project_deployments.md | Inference | JSON id types vary between string and number; treat the id as opaque numeric. |
| project_deployments.md | Gap | No primary source lets a user choose the numeric Project id at creation. |
| project_deployments.md | Gap | DSN path project id matching was not verified for every ingest path (`dsn-lookup` ignores it, `from_dsn` uses it). |
| project_deployments.md | Inference | Team membership is an access grant, not an ownership change. |
| project_deployments.md | Inference | The singular `team` field is legacy; `teams` is authoritative. |
| project_deployments.md | Gap | No maximum number of teams per project was found. |
| project_deployments.md | Inference | Chain: Organization -> Release -> Deploy -> Environment; one Release can have many Deploys. |
| project_deployments.md | Inference | Deploy cannot exist without Environment; Environment can exist without Deploy. |
| project_deployments.md | Inference | `ActivityType.DEPLOY` is an activity/notification record, not an ingested Event. |
| project_deployments.md | Inference | "Deployment event" is informal wording for a recorded Deploy, not an official entity. |
| project_deployments.md | Gap | No Event type literally named `deployment` was found; report as not found, not proven impossible. |
| project_deployments.md | Gap | Sentry CLI source paths for `deploys new` were not confirmed. |
| project_deployments.md | Inference | Release and Environment are orthogonal; Deploy joins them with time data. |
| project_deployments.md | Inference | Deploys cannot be deleted while Releases can; treat Deploy as append-only. |
| project_deployments.md | Inference | "Deployment event" should not be a synonym for Release or Environment; use "Deploy". |
| project_deployments.md | Gap | No authoritative primary-source definition of "Deployment event" was found. |
| project_deployments.md | Inference | API paths accept id-or-slug; the numeric id is needed only to construct a DSN. |
| project_deployments.md | Inference | The `projects` field on create-deploy accepts slugs; ids are implementation tolerance, not the contract. |
| project_deployments.md | Inference | No documented REST endpoint deletes a Deploy. |
| project_deployments.md | Gap | Full JSON response schema for the deploy endpoints was not returned as literal text. |
| project_deployments.md | Inference | A user cannot pick a numeric Project id through the documented API. |
| project_deployments.md | Inference | Numeric ids are large; code must not assume 32-bit integers. |
| project_deployments.md | Gap | No policy sentence states "users cannot choose the numeric id". |
| project_deployments.md | Gap | No source describes an administrator overriding a project id by direct database manipulation. |

## Conclusion

The refactor should follow the data model, not the short slogan. Keep the many-to-many User <-> Organization membership with the role on the join row, add the Team layer with two join tables (`OrganizationMemberTeam` and `ProjectTeam`), and give Project a single Organization foreign key. For deployments, do not add a Project foreign key to the deploy table. Model Organization -> Release -> Deploy, bind Deploy to Environment, and expose the project list as an input field on the create-deploy call.

Two design choices carry the most risk. First, project access comes from team membership, so a project with no team has no access path in the current API. Second, Sentry separates role scopes (people) from token scopes (automation), and a personal token never exceeds its owner's role. Fix both relationships before adding endpoints; later changes to the membership and release tables will be more costly than getting the hierarchy right now.
