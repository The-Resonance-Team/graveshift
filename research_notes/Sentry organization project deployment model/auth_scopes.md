# Sentry Authentication, Authorization and Scope Model (Organizations, Projects, Deployments)

Research date: 2026-11-22. Sources are primary: docs.sentry.io, develop.sentry.dev, and getsentry source files on GitHub `master`. All scope names and config keys below are quoted or transcribed from those sources. Where a source is old, the date is stated.

---

## Q1. What auth token types exist and what does each allow?

### Takeaway
Sentry has three main auth-token types (Organization Tokens, Internal Integrations, Personal Tokens), plus DSN-based auth for SDK events and legacy API keys. Scope is bound either to an organization, to a user, or to a single project.

### Cited Findings
- "There are three key types of auth tokens in Sentry: Organization Tokens, Internal Integrations, Personal Tokens." — [Auth Tokens](https://docs.sentry.io/account/auth-tokens/)
- Organization Tokens: "These tokens are bound to an organization, and have access to all projects within that organization. They have a limited set of permissions and are designed to be used in CI environments and with Sentry CLI." Their "permissions aren't customizable." Any user can create one; only org owners and managers can revoke them. Owners get a security email on creation. — [Auth Tokens](https://docs.sentry.io/account/auth-tokens/)
- Internal Integrations: "These tokens are bound to an organization, and have access to all projects within that organization. They can be created with a custom set of permissions, and are designed to be used in cases where organization tokens don't have sufficient access rights." Permissions "are customizable and editable." This is the token to use to programmatically create a project. — [Auth Tokens](https://docs.sentry.io/account/auth-tokens/)
- Personal Tokens (user auth tokens): "These tokens are bound to a user, and have access to all organizations and projects that user has access to." A personal token's "maximum scope is all the scopes that the user has access to for a given organization. A personal token cannot exceed the permissions of the user who created it." Permissions "are customizable but cannot be edited later." — [Auth Tokens](https://docs.sentry.io/account/auth-tokens/)
- OAuth2 exists for third-party apps: authorization-code flow, refresh tokens, and device authorization grant (RFC 8628). "Access tokens expire after 30 days." Example token response contains `"scope": "org:read project:read"`. — [API Authentication](https://docs.sentry.io/api/auth/)
- DSN-based auth: "Some API endpoints may allow DSN-based authentication. This is generally very limited ... This works similar to Bearer token authentication, but uses your DSN (Client Key)": `curl -H 'Authorization: DSN {DSN}' ...` — [API Authentication](https://docs.sentry.io/api/auth/)
- Legacy API keys: "API keys are a legacy means of authenticating. They will still be supported but are disabled for new accounts." Passed as HTTP Basic with the key as username and empty password: `curl -u {API_KEY}: ...`. — [API Authentication](https://docs.sentry.io/api/auth/)
- Exact token string formats: personal token `sntryu_[a-f0-9]{64}`; organization auth token `sntrys_[A-Za-z0-9+/=]+_[A-Za-z0-9+/]{43}`; single-use CLI setup code `sntryc_...`; single-use agent handoff code `sntryh_[A-Za-z0-9_-]{43}`; reserved prefixes `sntrya_`, `sntryi_`; internal integration / OAuth / legacy tokens `[a-f0-9]{64}`; legacy API key `[a-f0-9]{32}`; Relay key `[A-Za-z0-9_-]{43}`. — [Token and Credential Formats](https://docs.sentry.io/security-legal-pii/security/token-formats/)
- "DSNs aren't secrets, so leave them out of secret scanning rules." — [Token and Credential Formats](https://docs.sentry.io/security-legal-pii/security/token-formats/)
- Self-hosted note: "You can create authentication tokens within Sentry by creating an internal integration. This is also available for self-hosted Sentry." — [API Authentication](https://docs.sentry.io/api/auth/)

### Inferences
- Scope is two-dimensional: a token has (a) an owner/binding (org, user, or single-project DSN) and (b) a set of scopes. Effective access is the intersection: a personal token cannot grant more than the user's own roles.
- Internal integrations are the only token type with fully customizable, editable org-bound permissions. This matches the docs' advice to use them for full API access such as project creation.
- DSN auth is an exception to Bearer-token auth and only works on explicitly documented endpoints.

### Gaps
- The exact fixed scope set assigned to an Organization Token is not enumerated on the docs pages fetched; docs only say it is "limited" and "set to allow most CI-related tasks." Source `src/sentry/models/orgauthtoken.py` likely holds the exact list but was not fetched in full.

---

## Q2. What are the exact scope names for org-level and project-level access? Which scopes create projects, deploy releases, read events?

### Takeaway
Scopes are colon-delimited strings such as `org:read`, `project:write`, `project:releases`, `org:ci`, and `event:read`. Project creation uses `project:write`/`project:admin` (or `org:write` when member project creation is disabled). Release deploys accept `org:ci`, `project:admin`, `project:releases`, or `project:write`. Reading events uses `event:read`.

### Cited Findings
- API permissions table (exact method-to-scope mapping): Organizations GET = `org:read`, PUT/POST = `org:write`, DELETE = `org:admin`; "CI Workflows = `org:ci`"; Projects GET = `project:read`, PUT/POST = `project:write`, DELETE = `project:admin`; Teams `team:read/write/admin`; Members `member:read/write/admin`; Events GET = `event:read`, PUT = `event:write`, DELETE = `event:admin`; Releases GET/PUT/POST/DELETE = `project:releases`. — [Permissions & Scopes](https://docs.sentry.io/api/permissions/)
- "`org:ci`": "Use the `org:ci` scope for CI and deployment workflows, including uploading source maps, creating releases, and managing code mappings." — [Permissions & Scopes](https://docs.sentry.io/api/permissions/)
- "`project:releases`": "The `project:releases` scope will give you access to both project and organization release endpoints." — [Permissions & Scopes](https://docs.sentry.io/api/permissions/)
- Releases note: "if you're using `sentry-cli` to manage your releases, you'll need a token which also has `org:read` scope." — [Permissions & Scopes](https://docs.sentry.io/api/permissions/)
- "Events in Sentry are immutable and can only be deleted by deleting the whole issue." PUT/DELETE issue scopes are `event:write`/`event:admin`. — [Permissions & Scopes](https://docs.sentry.io/api/permissions/)
- Full canonical set from source `src/sentry/conf/server.py` (`SENTRY_SCOPES`): `org:read`, `org:write`, `org:admin`, `org:integrations`, `org:ci`, `org:tokens`, `member:invite`, `member:read`, `member:write`, `member:admin`, `team:read`, `team:write`, `team:admin`, `project:read`, `project:write`, `project:admin`, `project:releases`, `project:distribution`, `event:read`, `event:write`, `event:admin`, `alerts:read`, `alerts:write`, `dashboard:read`, `dashboard:write`, `membership:read`, `saved_query:read`, `saved_query:write`, `seer:read`, `seer:write`, `service_account:read`, `service_account:write`, `user_preference:read`, `user_preference:write`, `openid`, `profile`, `email`. — [server.py](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py)
- In the same source, `# "org:superuser", Do not use for any type of superuser permission/access checks` is commented out. `SENTRY_READONLY_SCOPES` = `org:read`, `member:read`, `team:read`, `project:read`, `event:read`, `alerts:read`, `dashboard:read`, `membership:read`, `saved_query:read`, `seer:read`, `service_account:read`, `user_preference:read`. — [server.py](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py)
- Scope category tuples from `src/sentry/models/apiscopes.py`: `project = (project:read, project:write, project:admin, project:releases, project:distribution)`, `team = (team:read, team:write, team:admin)`, `event = (event:read, event:write, event:admin)`, `org = (org:read, org:write, org:integrations, org:admin, org:ci)`, `member = (member:read, member:write, member:admin, member:invite)`, `alerts = (alerts:read, alerts:write)`. — [apiscopes.py](https://github.com/getsentry/sentry/blob/master/src/sentry/models/apiscopes.py)
- "Each API endpoint docs page lists the required permissions, in the 'Scopes' section. For example, the Create a New Project endpoint requires project:write permissions or higher." — [Create an Auth Token tutorial](https://docs.sentry.io/api/guides/create-auth-token/)
- Internal integration token example scopes seen in the API: `org:ci`. — [List Org Auth Tokens](https://docs.sentry.io/api/organizations/list-an-organizations-org-auth-tokens/)
- Newer scopes observed in current source/docs (2026 additions vs older docs): `org:tokens`, `project:distribution`, `dashboard:*`, `membership:read`, `saved_query:*`, `seer:*`, `service_account:*`, `user_preference:*`. — [server.py](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py)

### Inferences
- The model uses a read/write/admin triad per resource (`<resource>:read`, `:write`, `:admin`), plus special-purpose scopes (`org:ci`, `org:integrations`, `org:tokens`, `project:releases`, `project:distribution`).
- A team can mirror this by giving each resource its own scope prefix and making create operations require `:write`, destructive operations require `:admin`.
- `org:ci` is the preferred deploy/CI scope because it is limited to CI workflows rather than general org write.

### Gaps
- Source has a hierarchy mapping `SENTRY_SCOPE_HIERARCHY_MAPPING` (server.py ~line 2019) that defines scope implication (e.g., which scopes satisfy which). Full mapping was not transcribed; note that `org:ci` implies only itself, and `project:releases` implies only itself, from the grep lines seen.

---

## Q3. How does a Project DSN authenticate an SDK event? Is the DSN a credential with project scope, and how is it parsed?

### Takeaway
A DSN is a public, project-scoped client key. It is not a secret; it grants only event submission. It carries a 32-hex public key, an ingest host, and a numeric project id. Sentry's own lookup API uses only the public key and ignores the host and project id.

### Cited Findings
- "A DSN tells a Sentry SDK where to send events so the events are associated with the correct project." If the DSN is empty, "the SDK will not send any data over the network." — [DSN explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/)
- "DSNs are safe to keep public because they only allow submission of new events and related event data; they do not allow read access to any information." — [DSN explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/)
- DSN structure (exact quote): "`{PROTOCOL}://{PUBLIC_KEY}:{SECRET_KEY}@{HOST}{PATH}/{PROJECT_ID}`". Example `https://public@sentry.example.com/1` maps to "URI = https://sentry.example.com", "Public Key = public", "Project ID = 1". — [DSN explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/)
- "The secret part of the DSN is optional and effectively deprecated. While clients will still honor it, if supplied, future versions of Sentry will entirely ignore it." — [DSN explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/)
- "Each Sentry project has its own unique DSN." — [DSN explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/)
- DSN secret-scanning regex, SaaS: `https://[a-f0-9]{32}@o\d+\.ingest(\.[a-z]+)?\.sentry\.io/\d+`. Self-hosted/Relay: `https?://[a-f0-9]{32}@[^/]+/\d+`. "A DSN public key is 32 hex characters, the same as a legacy API key." — [Token and Credential Formats](https://docs.sentry.io/security-legal-pii/security/token-formats/)
- A client key object returned by the API shows the relationship: `"public": "60120449b6b1d5e45f75561e6dabd80b"`, `"secret": "189485c3b8ccf582bf5e12c530ef8858"`, `"projectId": 4505281256090153`, and `"dsn": { "public": "https://a785682ddda742d7a8a4088810e67791@o4504765715316736.ingest.sentry.io/4505281256090153", "secret": "https://...:...@o4504765715316736.ingest.sentry.io/4505281256090153", ... }`. — [Create a New Client Key](https://docs.sentry.io/api/projects/create-a-new-client-key/)
- Lookup API: `GET /api/0/organizations/{organization_id_or_slug}/dsn-lookup/?dsn=...`; "Only the DSN's public key is used: the host and project ID in the DSN are ignored." Returns 400 if `dsn` missing; 404 if no public key or no active client key of an active accessible project. Required scopes: `org:admin`, `org:read`, or `org:write`. — [Resolve a DSN to Its Project](https://docs.sentry.io/api/projects/resolve-a-dsn-to-its-project/)
- SDKs send events to dedicated ingest paths derived from the DSN, for example `https://o4504765715316736.ingest.sentry.io/api/4505281256090153/csp-report/?sentry_key=...`, `/security/`, `/minidump/`, `/nel/`, `/integration/otlp/v1/traces`. — [Create a New Client Key](https://docs.sentry.io/api/projects/create-a-new-client-key/)
- DSNs can be rotated/revoked in project Client Keys settings. — [DSN explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/)

### Inferences
- The DSN is effectively a project-scoped write-only capability. Authentication of an SDK event is by the public key (`sentry_key`), which maps to a client key bound to one project and one organization. The numeric project id in the URL is a routing hint, not the authority (the server resolves the key).
- A team mirroring this model can issue public write-only ingestion keys per project, ignore the embedded id for authorization, and keep a separate authenticated read path.
- Event submission is deliberately not covered by the API scope system; it uses client keys instead.

### Gaps
- Exact server-side parsing code (`sentry_key` extraction, DSN class) was not fetched. Confirmation rests on official docs and the DSN-lookup API description, which are explicit enough for the model.

---

## Q4. How does a membership role map to permissions for creating Projects and deployments?

### Takeaway
Permissions come from org-level roles (Billing, Member, Admin, Manager, Owner) and, on Business/Enterprise, team-level roles (Contributor, Team Admin). Project creation requires Team Admin or higher; Manager and Owner can do it for all teams. There is no separate "deployment" role; deployments are governed by API scopes (`org:ci`, `project:releases`, etc.) plus project access.

### Cited Findings
- "Permissions in Sentry are broadly handled using organization-level roles, which apply to all teams and projects in the organization. Users on a Business or Enterprise plan have access to team-level roles, which enable more granular permissions." — [Membership](https://docs.sentry.io/organization/membership/)
- Org roles (exact names from source and docs): Billing, Member, Admin, Manager, Owner. Source role ids in `SENTRY_ROLES`: `member`, `admin`, `manager`, `owner`, plus team roles `contributor` and team `admin` ("Team Admin"). — [Membership](https://docs.sentry.io/organization/membership/); [server.py](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py)
- "Can create and remove projects for the organization" permission table: Member = ✓\*\*\*, Admin = ✓, Manager = ✓, Owner = ✓ (Billing = blank). Footnote: "If your organization is on a Business or Enterprise plan, anyone who's part of the org will be able to create a project without having to be a Team Admin. When org members create a project, they'll become the Team Admin for that project by default." — [Membership](https://docs.sentry.io/organization/membership/)
- "Can add projects for teams" / "Can remove projects from teams": Manager and Owner only. "Can create and remove teams": Admin, Manager, Owner. "Can change organization settings, including open membership": Manager, Owner. "Can transfer projects to another organization": Owner only. — [Membership](https://docs.sentry.io/organization/membership/)
- Team-level table: "Can create new projects for the organization" = Team Admin only (for teams they administer). "Can change project settings" = Team Admin only for owned teams. — [Membership](https://docs.sentry.io/organization/membership/)
- "New projects can only be created and owned by teams the user is a Team Admin for." — [Membership](https://docs.sentry.io/organization/membership/)
- Union rule: "If a user holds multiple roles that grant different types of access to a single resource ... a union of those permissions is applied." — [Membership](https://docs.sentry.io/organization/membership/)
- "Projects can only be accessed by that project's team(s). Team Admins, Org Managers, and Org Owners can add or remove project teams." — [Membership](https://docs.sentry.io/organization/membership/)
- Open Membership: team membership open by default; turning it off makes access invite-only, needing Manager/Owner/Team Admin approval. — [Membership](https://docs.sentry.io/organization/membership/)
- Personal-token releases exception: "a personal token with the `project:releases` scope can create releases and upload artifact bundles for any project in the organization, even for projects whose teams the user isn't a member of." But "Changes to existing releases (updates, deletes, legacy release file uploads, and deploys) still require that the user has access to all projects associated with the release." — [Permissions & Scopes](https://docs.sentry.io/api/permissions/)
- Role scopes from source: `member` role includes `project:releases`, `project:read`, `org:read`; `admin` adds `project:write`, `project:admin`, `org:integrations`; `manager` adds `org:write`; `owner` adds `org:admin`. — [server.py](https://github.com/getsentry/sentry/blob/master/src/sentry/conf/server.py)
- Newer docs note: "This role [Org Admin] can no longer be assigned in Business and Enterprise plans. Existing users with Org Admin roles will retain their admin privileges." — [Membership](https://docs.sentry.io/organization/membership/)

### Inferences
- Roles are the human/permission layer; scopes are the token/API layer. A personal token's effective scopes are constrained by the user's role scopes.
- Create-project permission is deliberately tied to team ownership, not to a global "deploy" role. Deployments inherit project access from release/project membership.
- On self-hosted (Business-like feature set, no billing), expect the Manager/Owner + Team Admin model to apply.

### Gaps
- The exact mapping of team-level roles to numeric role constants and every scope in each role was only partially transcribed from source; the docs role table is the authoritative human-readable version.

---

## Q5. Which REST API paths and scopes are used for project creation, project keys, and release deploys?

### Takeaway
Project creation: `POST /api/0/teams/{org}/{team}/projects/` or `POST /api/0/organizations/{org}/projects/`; scopes `project:admin`/`project:write` (and `project:read` listed for the org-level route). Client keys: `POST /api/0/projects/{org}/{project}/keys/` with `project:admin`/`project:write`. Deploys: `POST /api/0/organizations/{org}/releases/{version}/deploys/` with `org:ci`, `project:admin`, `project:releases`, or `project:write`.

### Cited Findings
- `POST /api/0/teams/{organization_id_or_slug}/{team_id_or_slug}/projects/` — "Create a new project bound to a team. Note: If your organization has disabled member project creation, the `org:write` scope or the Team Admin role on the team is required." Scopes: `project:admin`, `project:write`. — [Create a New Project](https://docs.sentry.io/api/projects/create-a-new-project/)
- `POST /api/0/organizations/{organization_id_or_slug}/projects/` — "Create a new project for an organization. A personal team (`team-{username}`) is automatically created for the caller with Team Admin role, and the project is bound to it. If the org has member project creation disabled (`disable_member_project_creation`), `org:write` scope is required." Scopes listed: `project:admin`, `project:read`, `project:write`. — [Create a Project for an Organization](https://docs.sentry.io/api/projects/create-a-project-for-an-organization/)
- `POST /api/0/projects/{organization_id_or_slug}/{project_id_or_slug}/keys/` — "Create a new client key bound to a project. The key's secret and public key are generated by the server." Optional `name`, `rateLimit` (`window`/`count`), `useCase` (`user`, `profiling`, `tempest`, `demo`). Scopes: `project:admin`, `project:write`. — [Create a New Client Key](https://docs.sentry.io/api/projects/create-a-new-client-key/)
- `POST /api/0/organizations/{organization_id_or_slug}/releases/{version}/deploys/` — "Create a deploy for a given release." Required body: `environment`; optional `name`, `url`, `dateStarted`, `dateFinished`, `projects` (array of project slugs; "If not provided, deploys are created for all of the release's projects"). Scopes: `org:ci`, `project:admin`, `project:releases`, `project:write`. — [Create a Deploy](https://docs.sentry.io/api/releases/create-a-deploy/)
- Listing examples use `GET /api/0/organizations/{org}/projects/` with `Authorization: Bearer {TOKEN}`. — [API Authentication](https://docs.sentry.io/api/auth/)
- Org auth tokens are managed at `GET /api/0/organizations/{organization_id_or_slug}/org-auth-tokens/`; "token that has the `org:tokens` scope in addition to one of the scopes listed here" (`org:read`, `org:write`). — [List Org Auth Tokens](https://docs.sentry.io/api/organizations/list-an-organizations-org-auth-tokens/)
- `GET /api/0/organizations/{organization_id_or_slug}/dsn-lookup/?dsn=...` resolves a DSN; scopes `org:admin`, `org:read`, `org:write`. — [Resolve a DSN to Its Project](https://docs.sentry.io/api/projects/resolve-a-dsn-to-its-project/)
- All Bearer examples use header `Authorization: Bearer <auth_token>`; DSN auth uses `Authorization: DSN {DSN}`; legacy keys use Basic auth. — [API Authentication](https://docs.sentry.io/api/auth/)

### Inferences
- The URL hierarchy mirrors the ownership hierarchy: `/organizations/{org}/projects/`, `/projects/{org}/{project}/keys/`, `/organizations/{org}/releases/{version}/deploys/`.
- Deploy is an organization-level endpoint that can target a subset of projects via the `projects` body field. This is where org-level `org:ci` and project-level `project:*` scopes meet.
- `project:read` appearing in the org-level create-project endpoint's scope list is unusual; the docs list it as acceptable, so a team mirroring should treat create as write and verify against live behavior.

### Gaps
- No version-difference note found for these endpoints on the docs pages fetched (pages show current docs as of 2026).

---

## Q6. Self-hosted Sentry: how is the first superuser created, and how are registrations controlled? Name the exact config keys.

### Takeaway
During `./install.sh` the installer prompts to create the first user (superuser); the CLI equivalent is `sentry createuser --superuser`. Registration is controlled by the feature flag `auth:register` together with the option `auth.allow-registration` (default False). `SENTRY_SINGLE_ORGANIZATION = True` is set by default in the self-hosted config and controls single-org mode.

### Cited Findings
- Install flow: clone `getsentry/self-hosted`, check out latest release, run `./install.sh`, then `docker compose up --wait`; login page at `http://127.0.0.1:9000`. — [Self-Hosted Sentry](https://develop.sentry.dev/self-hosted/)
- Installer user creation: "creating a user results in a prompt which stalls the setup script" and a `--skip-user-creation` flag exists. — [self-hosted issue #1721](https://github.com/getsentry/self-hosted/issues/1721)
- CLI creation of a superuser: `sentry createuser --email YOU@example.com --password PASSWORD --superuser` (also historically `sentry createuser --superuser` which prompts). — [self-hosted issue #2663 comment 8](https://github.com/getsentry/sentry/issues/2663); [install guide example](https://medium.com/@aivaonair/install-self-hosted-sentry-io-dda170f07fda)
- "single organization mode is enabled on new installs when generating the config which disables creating multiple orgs, and when you create a user (via `sentry createuser`) they get added to that org." — [getsentry/sentry issue #2663](https://github.com/getsentry/sentry/issues/2663) (2016; still consistent with current config below)
- Current self-hosted file `sentry/sentry.conf.example.py` contains `# Instruct Sentry that this install intends to be run by a single organization ...` then `SENTRY_SINGLE_ORGANIZATION = True`. — [sentry.conf.example.py](https://github.com/getsentry/self-hosted/blob/master/sentry/sentry.conf.example.py)
- Same file sets feature flags via `SENTRY_FEATURES["projects:sample-events"] = False` and `SENTRY_FEATURES.update({... "organizations:invite-members", "organizations:sso-basic", ...})`. — [sentry.conf.example.py](https://github.com/getsentry/self-hosted/blob/master/sentry/sentry.conf.example.py)
- Registration requires BOTH conditions in source: `return features.has("auth:register") and options.get("auth.allow-registration")` — [utils/auth.py](https://github.com/getsentry/sentry/blob/master/src/sentry/utils/auth.py)
- Option definition with exact key and default: `register("auth.allow-registration", default=False, flags=FLAG_ALLOW_EMPTY | FLAG_PRIORITIZE_DISK | FLAG_REQUIRED)` — [options/defaults.py](https://github.com/getsentry/sentry/blob/master/src/sentry/options/defaults.py)
- Legacy/historical config key from maintainer (2016): `SENTRY_FEATURES['auth:register'] = False` "goes in the config.py file". — [getsentry/sentry issue #2663](https://github.com/getsentry/sentry/issues/2663)
- Config file roles: `sentry/config.yml` (generated from `config.example.yml`) holds most options; `sentry/sentry.conf.py` (generated from `sentry.conf.example.py`) holds advanced settings; environment keys in `.env` / `.env.custom`. — [Self-Hosted Configuration](https://develop.sentry.dev/self-hosted/configuration/)
- In `config.yml`, option-style keys are used (e.g. `system.url-prefix`, `system.admin-email`, `mail.*`). — [Self-Hosted Configuration](https://develop.sentry.dev/self-hosted/configuration/); [self-hosted self-hosted page](https://develop.sentry.dev/self-hosted/)

### Inferences
- For a 2026 self-hosted install, the precise registration gate is `auth.allow-registration` (option, default `False`) AND the `auth:register` feature being enabled. Setting `SENTRY_FEATURES["auth:register"] = False` in `sentry.conf.py` also disables registration via the feature check. `SENTRY_SINGLE_ORGANIZATION = True` is separate: it controls org creation/UI, not registration.
- First-user creation is interactive in `install.sh`; automate with `--skip-user-creation` plus the `createuser --superuser` CLI.
- Note version difference: the 2016 advice (`SENTRY_FEATURES['auth:register'] = False`) still names a live feature key, but current source adds the independent `auth.allow-registration` option.

### Gaps
- The exact syntax to set `auth.allow-registration` in `config.yml` versus `SENTRY_OPTIONS[...]` in `sentry.conf.py` was not confirmed from a primary doc snippet; the option name and default are confirmed from source. Verify in `config.example.yml` before publishing a copy-paste snippet.
