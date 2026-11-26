# Sentry Organization and User/Member Data Model

Scope: Sentry as of 2026 (master branch of `getsentry/sentry` and `getsentry/self-hosted`, read 2026-11-22). All source links point to primary Sentry docs or Sentry source code. Third-party sources are marked as such.

---

## Key Question 1: What is the real Sentry hierarchy? Where do Teams sit, and are Teams required for a Project?

### Takeaway
The core chain is User <-> Organization through `OrganizationMember` (membership), then Organization -> Project. Teams sit between Membership and Project: a membership joins zero or more Teams through `OrganizationMemberTeam`, and a Project belongs to one Organization and is linked to one or more Teams through `ProjectTeam`. A Project is always owned by at least one Team in the current API; the create-project endpoint creates a personal team for the caller if no team is chosen.

### Cited Findings
- Organization model docstring: "An organization represents a group of individuals which maintain ownership of projects." — [Organization model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organization.py)
- Team model docstring: "A team represents a group of individuals which maintain ownership of projects." `Team.organization` is a `FlexibleForeignKey("sentry.Organization")`; `Team.unique_together = (("organization", "slug"),)`; `TeamStatus` = ACTIVE / PENDING_DELETION / DELETION_IN_PROGRESS. — [Team model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/team.py)
- OrganizationMember model docstring: "Identifies relationships between organizations and users." It has `organization = FlexibleForeignKey("sentry.Organization", related_name="member_set")`, `user_id = HybridCloudForeignKey("sentry.User", on_delete="CASCADE", null=True, blank=True)`, `role = CharField(max_length=32, default=organization_roles.get_default().id)`, `teams = ManyToManyField("sentry.Team", through="sentry.OrganizationMemberTeam")`, and `unique_together = (("organization", "user_id"), ("organization", "email"))`. — [OrganizationMember model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organizationmember.py)
- `OrganizationMember.is_pending` is `self.user_id is None`. An invite row keeps an `email` and a `token` until a User is set; `token_expires_at` is set to `INVITE_DAYS_VALID = 30` days. `InviteStatus` values: `APPROVED`, `REQUESTED_TO_BE_INVITED`, `REQUESTED_TO_JOIN`. — [OrganizationMember model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organizationmember.py)
- `Team.member_set` is derived, not a direct relation: it filters `self.organization.member_set` by `organizationmemberteam__team=self`, `organizationmemberteam__is_active=True`, `user_id__isnull=False`, `user_is_active=True`. — [Team model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/team.py)
- `OrganizationMemberTeam` docstring: "Identifies relationships between organization members and the teams they are on." Fields: `team` FK, `organizationmember` FK, `is_active` boolean, `role` string (nullable); `unique_together = (("team", "organizationmember"),)`. — [OrganizationMemberTeam source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organizationmemberteam.py)
- Project model: `organization = FlexibleForeignKey("sentry.Organization")`, `teams = ManyToManyField("sentry.Team", related_name="teams", through=ProjectTeam)`, `slug`, `name`. — [Project model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/project.py)
- Docs: "Projects can only be accessed by that project's team(s). Team Admins, Org Managers, and Org Owners can add or remove project teams." Also: "Any Org Member can get access to a project by joining the team that's associated with that project." — [Organization and User Management](https://docs.sentry.io/organization/membership/#project-access-and-team-membership)
- Docs edge case: "Add Project B to Teams 2, 3, and 4." and "New projects can only be created and owned by teams the user is a Team Admin for." — [Organization and User Management, Edge Cases](https://docs.sentry.io/organization/membership/#edge-cases)
- Create-project API: "A personal team (`team-{username}`) is automatically created for the caller with Team Admin role, and the project is bound to it. If the org has member project creation disabled (`disable_member_project_creation`), `org:write` scope is required." — [Create a Project for an Organization](https://docs.sentry.io/api/projects/create-a-project-for-an-organization/)
- `OrganizationManager.get_for_user` "Returns a set of all organizations a user has access to" by querying `OrganizationMember.objects.filter(user_id=user.id)`. This confirms membership is the only User <-> Organization link used for access. — [Organization model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organization.py)

### Inferences
- The many-to-many User <-> Organization relation is explicit in the schema: one row in `sentry_organizationmember` per (organization, user) pair, with `role` stored on the membership and not on the User.
- A Project has one Organization FK and a set of Teams; Teams are scoped to one Organization. Therefore projects cannot span organizations, but one project can be owned by several teams in its organization.
- Team membership is optional for an OrganizationMember (the `teams` M2M is `blank=True`); global access exists via `has_global_access = BooleanField(default=True)`. Team membership is not optional for a Project in the current API, because the API binds a new project to a team (auto-creating a personal team when needed).
- The hierarchy suitable for mirroring: `User` -> `OrganizationMember` (role, status, invite token) -> `Organization` (name, slug, flags); `OrganizationMember` -> `OrganizationMemberTeam` (role) -> `Team`; `Organization` -> `Project` <- `ProjectTeam` -> `Team`.

### Gaps
- I found no explicit sentence in docs that states "a project must have at least one team". The requirement is inferred from the create-project endpoint text and from the access rules. A direct schema constraint that forbids zero teams was not found.

---

## Key Question 2: What identifies an Organization: numeric id, slug, or both? Which is used in URLs and APIs?

### Takeaway
Both. The Organization has an auto/snowflake numeric primary key (`id`) and a globally unique `slug`. Browser URLs and customer-domain URLs use the slug. REST API path parameters accept either the ID or the slug and are literally named `organization_id_or_slug`. API responses show both fields as strings.

### Cited Findings
- Organization fields: `name = CharField(max_length=64)`, `slug = SentryOrgSlugField(unique=True)`, `status`, `date_added`, `default_role`. The class is decorated `@snowflake_id_model` and `@cell_silo_model`. — [Organization model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organization.py)
- Source URL helper: `Organization.get_url(slug)` calls `reverse(Organization.get_url_viewname(), args=[slug])`; `absolute_url()` and `absolute_api_url()` build paths with `slug=self.slug`. The API URL example is "https://sentry.io/api/0/organizations/<org_slug><path>". — [Organization model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organization.py)
- On save, the slug is derived from the name when absent: `target = slugify_target.lower().replace("_", "-").strip("-")` and `slugify_instance(self, target, reserved=RESERVED_ORGANIZATION_SLUGS)`. — [Organization model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organization.py)
- API retrieve: path `GET /api/0/organizations/{organization_id_or_slug}/`; parameter description: "The ID or slug of the organization the resource belongs to." — [Retrieve an Organization](https://docs.sentry.io/api/organizations/retrieve-an-organization/)
- API add member: path parameter `organization_id_or_slug` described as "The ID or slug of the organization the resource belongs to." — [Add a Member to an Organization](https://docs.sentry.io/api/organizations/add-a-member-to-an-organization/)
- List response shows both identifiers: `"id": "2"`, `"slug": "the-interstellar-jurisdiction"`, `"name": "The Interstellar Jurisdiction"`, `"links": {"organizationUrl": "https://the-interstellar-jurisdiction.sentry.io", "regionUrl": "https://us.sentry.io"}`. — [List Your Organizations](https://docs.sentry.io/api/users/list-your-organizations/)
- `id` values are returned as JSON strings. Older installs show small integers ("2"); newer objects show large snowflake IDs (for example a project `"id": "6758470122493650"`, a team `"id": "2349234102"`). — [List Your Organizations](https://docs.sentry.io/api/users/list-your-organizations/); [Create a Project for an Organization](https://docs.sentry.io/api/projects/create-a-project-for-an-organization/)

### Inferences
- For a mirror implementation: keep a numeric surrogate key plus a unique, URL-safe slug. Use the slug for human-facing routes; accept either key in API routes.
- There is no separate public Organization "code" or tenant short name beyond slug in the primary model.

### Gaps
- I did not verify whether slugs are case-insensitive at the database level. The source adds a case-insensitive index (`Upper("slug")`), but the `unique=True` constraint is on the raw slug.

---

## Key Question 3: What identifies a User and a Membership? What roles exist and who can create Projects?

### Takeaway
A User has a numeric primary key plus a unique `username` (normally the email) and an `email` field; the API returns a `user` object nested inside each membership. A Membership has its own numeric ID, an Organization FK, an optional User FK, an optional invite email, a `role` string, flags, and team links. Organization roles are `billing`, `member`, `admin`, `manager`, `owner`; team roles are `contributor` and `admin`. Project creation is limited to Managers/Owners, Admins (legacy), Team Admins for their teams, and all members on Business/Enterprise plans (personal projects).

### Cited Findings
- User model: `username = CharField(max_length=128, unique=True)`, `name` (display name, stored in DB column `first_name`), `email = EmailField(max_length=200)`, `email_unique`, `is_staff`, `is_active`, `is_superuser`, `is_managed`, `is_suspended`, `date_joined`. `USERNAME_FIELD = "username"`; DB table `auth_user`. — [User model source](https://github.com/getsentry/sentry/blob/master/src/sentry/users/models/user.py)
- On save, if `username` is empty it is set to `self.email`; new users set `email_unique = self.email`. — [User model source](https://github.com/getsentry/sentry/blob/master/src/sentry/users/models/user.py)
- Membership API example: top-level `"id": "57377908164"` (membership ID), `"email"`, `"name"`, `"user": {"id": "280094367316", "username": "sirpenguin@antarcticarocks.com", ...}`, `"orgRole": "member"`, `"pending": false`, `"inviteStatus": "approved"`, `"flags"`, `"dateCreated"`. A pending invite has `"user": null` and `"pending": true`. — [List an Organization's Members](https://docs.sentry.io/api/organizations/list-an-organizations-members/)
- Default role config: `SENTRY_DEFAULT_ROLE = "member"`; `OrganizationMember.role` default is `organization_roles.get_default().id`. The top role is `roles.get_top_dog().id` (Owner). — [conf/server.py source](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py); [OrganizationMember source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organizationmember.py)
- `SENTRY_ROLES` ids in source: `member`, `admin` (with `"is_retired": True`), `manager`, `owner`. `SENTRY_TEAM_ROLES` ids: `contributor` and `admin` ("Team Admin"). A copy named `SENTRY_GRANULAR_ROLES` adds granular scopes behind the `organizations:granular-permission-scopes` flag. — [conf/server.py source](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py)
- Docs org roles: Billing, Org Member, Org Admin, Org Manager, Org Owner. "For Business and Enterprise plans, the Org Admin role has been replaced by Team Admins and can no longer be assigned to new users." — [Organization and User Management](https://docs.sentry.io/organization/membership/#organization-level-roles)
- Docs permission table: "Can create and remove projects for the organization" is allowed for Member (\*\*\*), Admin, Manager, Owner. Footnote: "If your organization is on a Business or Enterprise plan, anyone who's part of the org will be able to create a project without having to be a Team Admin. When org members create a project, they'll become the Team Admin for that project by default." — [Organization and User Management, Permissions](https://docs.sentry.io/organization/membership/#permissions)
- "Only Org Admins, Managers, and Owners can add new teams to an organization." Org Managers and Owners "can perform Team Admin actions for all teams without needing to join." — [Organization and User Management, Team-level Roles](https://docs.sentry.io/organization/membership/#team-level-roles)
- Team role table: Team Contributor and Team Admin; only Team Admin can "create new projects for the organization" for teams they administer. — [Organization and User Management, Team Permissions](https://docs.sentry.io/organization/membership/#permissions-1)
- Add-member API role field values: `billing`, `member`, `manager`, `owner`, `admin` (admin "can no longer be assigned in Business and Enterprise plans. Use TeamRoles instead."). Team roles in `teamRoles`: `contributor` and `admin`. — [Add a Member to an Organization](https://docs.sentry.io/api/organizations/add-a-member-to-an-organization/)
- Invite fields on membership: `token`, `token_expires_at`, `inviter_id`, `invite_status`, `has_global_access`, `flags` (`sso:linked`, `sso:invalid`, `member-limit:restricted`, `idp:provisioned`, `idp:role-restricted`, `partnership:restricted`). — [OrganizationMember source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organizationmember.py)
- Owner cannot be removed if sole owner: `is_only_owner()` checks `roles.get_top_dog().id` and other members with that role. — [OrganizationMember source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organizationmember.py)

### Inferences
- Mirror model: `role` belongs on the membership. Team-level role belongs on the membership-team join row. `has_global_access` and invite metadata also belong on the membership.
- `admin` is a legacy org role. A new implementation for self-hosted/Business-like behavior can model Owner, Manager, Member (plus Billing if billing exists) and Team Admin/Contributor, and skip Org Admin.

### Gaps
- I found no documented limit on the number of owners per organization; source only guards removal of the *only* owner.
- Version note not fully resolved: the exact release that retired Org Admin is not stated in the docs I read.

---

## Key Question 4: How does self-hosted Sentry handle the first user and first organization? Is there a setup/bootstrap step, and how is registration closed or opened?

### Takeaway
Self-hosted uses an install script and a first-run wizard, then a CLI `createuser` command bootstraps the first user. In single-organization mode (the self-hosted default), `createuser` adds that user to the default organization as Owner when `--superuser` is set, or with the org's default role otherwise. Public registration is controlled by `auth.allow-registration` (default `False`), which does not block SSO or invite-based registration.

### Cited Findings
- Install steps: clone `getsentry/self-hosted` at the latest release, run `./install.sh`, then `docker compose up --wait`. "Sentry binds to port `9000` by default. You should be able to reach the login page at http://127.0.0.1:9000." — [Self-Hosted Sentry](https://develop.sentry.dev/self-hosted/#getting-started)
- Configuration files created at install: `config.yml` and `sentry.conf.py`; "During a new install, Sentry prompts first for a walkthrough of the Installation Wizard." Declared config in these files overrides values set in the UI. — [Backend Configuration](https://develop.sentry.dev/backend/config/#first-install)
- Self-hosted `sentry.conf.example.py` explicitly sets `SENTRY_SINGLE_ORGANIZATION = True` with comment: "Instruct Sentry that this install intends to be run by a single organization and thus various UI optimizations should be enabled." — [self-hosted sentry.conf.example.py](https://github.com/getsentry/self-hosted/blob/master/sentry/sentry.conf.example.py)
- Core Sentry default is the opposite: `SENTRY_SINGLE_ORGANIZATION = False` (source), `SENTRY_ORGANIZATION: int | None = None`, `SENTRY_ENABLE_INVITES = True`. — [conf/server.py](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py)
- `createuser` command options include `--email` (multiple), `--org-id` ("Org ID to add users to, if not provided will use the default Org."), `--password`, `--superuser/--no-superuser` ("Superusers have full access to Sentry, across all organizations."), `--staff`, `--no-password`, `--force-update`. It creates the User with `username=email` and `email=email`. — [createuser command source](https://github.com/getsentry/sentry/blob/master/src/sentry/runner/commands/createuser.py)
- Bootstrap membership logic in `createuser`: "if settings.SENTRY_SINGLE_ORGANIZATION: ... Get the org if specified, otherwise use the default ... if superuser: role = roles.get_top_dog().id else: role = org.default_role; member = organization_service.add_organization_member(...)" and "if we've only got a single team let's go ahead and give access to that team". It echoes "Added to organization: {org.slug}". Also `if superuser and (settings.SENTRY_SELF_HOSTED or settings.SENTRY_SINGLE_ORGANIZATION): _set_superadmin(user)`. — [createuser command source](https://github.com/getsentry/sentry/blob/master/src/sentry/runner/commands/createuser.py)
- Organization.get_default(): "Return the organization used in single organization mode." It uses `settings.SENTRY_ORGANIZATION` if set, else the first ACTIVE organization. `is_default` is only true when `SENTRY_SINGLE_ORGANIZATION` is set. — [Organization model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organization.py)
- Registration setting: `auth.allow-registration`, declared in `config.yaml`: "Should Sentry allow users to create new accounts? Defaults to `False`. This setting only controls public registration. Users can still register new accounts via Single Sign-On and membership invites. Note: This setting is often configured via the UI." — [Backend Configuration, Authentication](https://develop.sentry.dev/config/#authentication)
- The value is also stored as a DB option `auth.allow-registration` in the `sentry_option` table. A Sentry maintainer states: "The value is written in your Postgres database upon completing the onboarding page during a clean installation of Sentry. The value in Postgres will hold priority over your config file". — [self-hosted issue #2071](https://github.com/getsentry/self-hosted/issues/2071)
- Older maintainer guidance in issue #2663: "when you create a user (via sentry createuser) they get added to that org" and "single organization mode is enabled on new installs when generating the config which disables creating multiple orgs"; also "auth:register is literally only for 'can new users register', it has nothing to do with organizations". — [sentry issue #2663](https://github.com/getsentry/sentry/issues/2663)
- `SENTRY_ENABLE_INVITES = True` by default; invite emails are sent only when this setting is on, while audit logging still records a member add. — [OrganizationMember source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organizationmember.py)

### Inferences
- Bootstrap sequence for self-hosted: install → first-run wizard sets base config → start services → create first user with `createuser --superuser` → that user becomes Owner of the default organization → close public registration with `auth.allow-registration: false` and add further users through invites/SSO.
- A mirror implementation should keep "first user becomes first org owner" as an explicit bootstrap step, and keep registration allow/deny separate from the ability to add members.

### Gaps
- I did not find a current official doc page that lists the exact `docker compose run --rm web createuser ...` command for self-hosted; the command itself is confirmed from Sentry source, while the Docker invocation appears in community guides only. Treat the exact container invocation as unverified from primary docs.
- Version difference: issue #2663 (2016) used `SENTRY_FEATURES['auth:register']`; current config uses `auth.allow-registration`. Do not use the old flag in a 2026 design.

---

## Key Question 5: Can one user belong to several organizations, and can one deployment host many organizations?

### Takeaway
Yes to both. One user can be a member of many organizations, and one Sentry deployment can host many organizations. Self-hosted defaults to single-organization mode as a UI optimization; that flag can be turned off. Deleting an organization does not delete its user accounts.

### Cited Findings
- Docs, exact quote: "A user can be a Member of several organizations, so deleting an organization doesn't delete user accounts." — [Organization and User Management, Remove an Organization](https://docs.sentry.io/organization/membership/#remove-an-organization)
- Source: `OrganizationManager.get_for_user(user)` returns all organizations by querying `OrganizationMember.objects.filter(user_id=user.id)`, so multiple memberships yield multiple organizations. — [Organization model source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organization.py)
- API: `GET /api/0/organizations/` is named "List Your Organizations" and returns a JSON array of organizations for the authenticated user. — [List Your Organizations](https://docs.sentry.io/api/users/list-your-organizations/)
- Source: one organization can have many members; `OrganizationMember.Meta.unique_together` only constrains (organization, user) and (organization, email), so the same user_id can appear with different organization values. — [OrganizationMember source](https://github.com/getsentry/sentry/blob/master/src/sentry/models/organizationmember.py)
- Multi-org deployment: core default is `SENTRY_SINGLE_ORGANIZATION = False`; self-hosted example config sets it `True` for "UI optimizations". — [conf/server.py](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py); [self-hosted sentry.conf.example.py](https://github.com/getsentry/self-hosted/blob/master/sentry/sentry.conf.example.py)
- Maintainer quote from 2016 still describes the design: "There's a single organization by default in installations" and "single organization mode is enabled on new installs when generating the config which disables creating multiple orgs". — [sentry issue #2663](https://github.com/getsentry/sentry/issues/2663)
- Sentry SaaS also supports multiple regions/organizations: the organization response includes `"links": {"organizationUrl": ..., "regionUrl": "https://us.sentry.io"}`, and the CLI API command says "A relative endpoint that names an organization ... is sent to that organization's region". — [List Your Organizations](https://docs.sentry.io/api/users/list-your-organizations/); [Sentry CLI api command](https://cli.sentry.dev/commands/api/)

### Inferences
- The data model is multi-tenant by design: `Organization` is the tenant root; `OrganizationMember` is the join table that lets a User belong to many tenants with a different role in each.
- Self-hosted single-org mode is a deployment option, not a schema limit. A mirror should keep the many-to-many design and offer a single-tenant setting only as a simplification.

### Gaps
- I found no current doc that states the exact behavior/limitations when `SENTRY_SINGLE_ORGANIZATION = False` on self-hosted, beyond "various UI optimizations should be enabled". Treat it as a UI/default setting, not a hard security boundary.

---

## Key Question 6: Which REST API endpoints create/list Organizations and add/remove Members? Give exact paths and request fields.

### Takeaway
Organization list/retrieve/update use `/api/0/organizations/` and `/api/0/organizations/{organization_id_or_slug}/`. Member add/list/delete use the `members/` subresource. Creation of an organization via the public REST API is not documented on docs.sentry.io, but Sentry clients use `POST /api/0/organizations/` with a `name` field.

### Cited Findings
- `GET /api/0/organizations/` — "List Your Organizations". No body. Response fields include `id`, `slug`, `name`, `status`, `dateCreated`, `features`, `links`, `require2FA`, `allowMemberInvite`, `allowMemberProjectCreation`, `allowSuperuserAccess`. — [List Your Organizations](https://docs.sentry.io/api/users/list-your-organizations/)
- `GET /api/0/organizations/{organization_id_or_slug}/` — "Retrieve an Organization". Query param `detailed`: "Specify '0' to return organization details that do not include projects or teams." Scopes: `org:admin`, `org:read`, `org:write`. — [Retrieve an Organization](https://docs.sentry.io/api/organizations/retrieve-an-organization/)
- `PUT /api/0/organizations/{organization_id_or_slug}/` — "Update an Organization", JSON body. — [Update an Organization](https://docs.sentry.io/api/organizations/update-an-organization/)
- `POST /api/0/organizations/` — create organization. Third-party Sentry API client code: `CreateOrganization` does `c.do("POST", OrgEndpointName, &org, orgreq)` with `orgreq := &Organization{Name: orgname}`; `OrgEndpointName = "organizations"`. This is a community client, not Sentry's own docs. — [atlassian/go-sentry-api organization.go](https://github.com/atlassian/go-sentry-api/blob/master/organization.go)
- The docs "Organizations" API index does not show a "Create an Organization" page, while it does list list/retrieve/update/delete-member endpoints. — [Organizations API index](https://docs.sentry.io/api/organizations/)
- `POST /api/0/organizations/{organization_id_or_slug}/members/` — "Add or invite a member to an organization." Body fields:
  - `email` (string, REQUIRED) — "The email address to send the invitation to."
  - `role` (string, Deprecated, use `orgRole`) — values `member`, `admin`, `manager`, `owner`.
  - `orgRole` (string) — `billing`, `member`, `manager`, `owner`, `admin` (admin retired on Business/Enterprise).
  - `teams` (array, Deprecated, use `teamRoles`) — slugs of teams.
  - `teamRoles` (array of objects) — team and team role: `contributor` or `admin`.
  - `sendInvite` (boolean, default True), `reinvite` (boolean, default True), `regenerate` (boolean) — "Reissue the invite token, invalidating any previously sent invite link."
  - Scopes: `member:admin`, `member:invite`, `member:write`. Success 201. — [Add a Member to an Organization](https://docs.sentry.io/api/organizations/add-a-member-to-an-organization/)
- `GET /api/0/organizations/{organization_id_or_slug}/members/` — "List all organization members." — [List an Organization's Members](https://docs.sentry.io/api/organizations/list-an-organizations-members/)
- `DELETE /api/0/organizations/{organization_id_or_slug}/members/{member_id}/` — "Remove an organization member." Path params: `organization_id_or_slug` (ID or slug), `member_id` (ID of member). Scopes: `member:admin`, `member:read`, `member:write`. Success 204 No Content. — [Delete an Organization Member](https://docs.sentry.io/api/organizations/delete-an-organization-member/)
- `POST /api/0/organizations/{organization_id_or_slug}/projects/` — "Create a Project for an Organization." Body: `name` (REQUIRED), `slug` (auto-generated from name if absent), `platform`, `default_rules` (default true). Auto-creates personal team and binds project. Scopes: `project:admin`, `project:read`, `project:write`. — [Create a Project for an Organization](https://docs.sentry.io/api/projects/create-a-project-for-an-organization/)
- `GET /api/0/organizations/$SENTRY_ORG_ID/teams/?detailed=0` — "List an Organization's Teams" tutorial command. — [Teams tutorial](https://docs.sentry.io/api/guides/teams-tutorial/)
- Member role update also exists: "Update an Organization Member's Roles" is listed in the Organizations API index. — [Organizations API index](https://docs.sentry.io/api/organizations/)

### Inferences
- Access pattern for a mirror API: `/api/0/organizations/{idOrSlug}` is the tenant root; membership is a subresource with `POST` (invite), `GET` (list), `DELETE /members/{memberId}` (remove).
- Make `orgRole` the current field and keep `role`/`teams` only as deprecated aliases; make `teamRoles` the current way to assign a team-level role.
- DELETE by member ID (not user ID) confirms the membership is its own resource.

### Gaps
- I could not confirm from a primary Sentry source the exact request schema of `POST /api/0/organizations/` for creating an organization. Public REST docs omit it; the evidence is a third-party client plus Formance/UI behavior. Do not publish the full field list as confirmed fact.
- I did not retrieve the exact body fields of "Update an Organization Member's Roles"; only its existence and path family were confirmed from the API index.

---

## Version and source notes
- All source files were read from the `master` branch of `getsentry/sentry` and `getsentry/self-hosted` on 2026-11-22. Sentry IDs are snowflakes for new Organization/Team/Project rows; older rows show small numeric IDs in API examples.
- `SENTRY_ROLES` and `SENTRY_GRANULAR_ROLES` coexist in `conf/server.py`; the granular variant is used when the `organizations:granular-permission-scopes` feature flag is on. — [conf/server.py](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py)
- Self-hosted is described by Sentry as "the Business plan without any software limitations and no paid tier". — [Self-Hosted Sentry](https://develop.sentry.dev/self-hosted/#differences-between-self-hosted-and-saas)
- Org Admin (`admin`) is marked `is_retired: True` in source and cannot be assigned on Business/Enterprise plans in docs. — [conf/server.py](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py); [docs](https://docs.sentry.io/organization/membership/#organization-level-roles)
