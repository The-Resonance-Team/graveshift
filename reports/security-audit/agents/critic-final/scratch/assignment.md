You are a fresh source-only final-clean coverage critic, agent critic-final. Read source but do not execute targets, contact networks, edit source, or write shared files. Your job is to propose omitted coverage, not findings.

# Graveshift audit architecture

Target: `/Users/xirothedev/workspace/graveshift`. Reviewed HEAD: `d99415203c22eccbefcbee8d7588ccb227534b53`. Profile: standard. Source-only review of the full runtime, packages, examples, CI, hooks, packaging and deployment definitions. The worktree has an untracked example configuration in scope. Untracked Sentry research/report documents are excluded. No prior compatible ledger or findings were found in the default audit location. No carried findings or hunter exclusions exist. `source-manifest.json` records current source hashes for later comparison.

## Product and principals

Graveshift watches services, ingests Events, detects Hauntings, builds a Diagnosis, routes Work items and prepares draft pull requests. It never merges fixes. A separate actuator supports approved runtime restart/scale actions. Accounts register and join Organizations as owners or members. Organizations directly own Projects. One deployment serves multiple Organizations; `projectId` scopes Events, subjects, durable rows, Credentials and Audit chains (`GLOSSARY.md:9`, `docs/adr/0023-organization-is-the-tenant-root.md:6`). Organization owners create scoped OAuth clients. OAuth clients issue delegated MCP/plugin Credentials. Plugin producers and watched workloads supply lower-trust telemetry. MCP callers read scoped state and request policy proposals. Models, repository contents and verification commands are untrusted relative to host credentials and publication authority. Operators control boot config, integration endpoints, provider/GitHub keys and infrastructure.

Sentry is a source-documented comparator for Organization/Project access and DSN/envelope ingestion. Graveshift deliberately omits Sentry's Team layer; this is an intended access model, not a defect. Collector and Sentry Events intentionally remain unassigned to a Deployment when no commit SHA is supplied (`docs/adr/0027-deployment-is-the-triage-root.md:13`).

## Stack and active source paths

Bun/TypeScript workspaces contain a NestJS 12.6 API, Effect 4.1 daemon, Zod/class-validator contracts, Prisma 7.10/PostgreSQL, NATS JetStream, AI SDK provider adapters, Docker/Kubernetes collectors and GitHub publication adapters. Bun is pinned to 1.4.4; the installed executable resolves to 1.4.5. Locally present dependencies do not authorize execution.

`apps/api/src/main.ts` creates the app, connects Prisma, bootstraps identity and listens. `apps/api/src/stdio.ts` starts the same MCP context with trusted local stdio semantics. `apps/daemon/src/main.ts` obtains boot config, starts collectors and the Event consumer, and exposes private read/command handlers plus public health. `packages/actuator/src/main.ts` opens local durable admission state and the action handler. Support Compose defines an optional API, actuator, broker/store and proxies; it does not launch a daemon. The demo has separate API/worker launchers. Kubernetes/Helm/kind are explicitly incomplete scaffolds. One-shot workflows use separate trusted and target checkouts. Several README passages are stale; current source determines reachability.

## Inputs, transformations and boundaries

- HTTP identity routes use account JWTs; Organization membership and owner checks live in `identity.service.ts`. OAuth JWTs pin HS256, issuer/audience and current registered scope (`auth/oauth-principal.ts`). Credentials are random 256-bit values, stored hashed, scoped at issue and checked for expiry/revocation on use.
- Plugin `/api/events` checks Project/service binding, validates/redacts the envelope, resolves Deployment in the bound Project and publishes. Sentry `/api/:projectId/envelope` checks the same Credential component, a numeric Project and service binding, then parses bounded raw frames, maps and redacts. Telemetry can influence Diagnosis and later fixes; shape validation is not provenance.
- MCP HTTP pairs bearer and scope guards. Project context flows to `HttpMcpBackend` and private daemon reads. Public tools include incidents, logs, metrics, audit and proposals; proposals do not execute actions. Event polling uses a custom SDK bridge. Stdio trusts its local process but project-dependent reads/proposals still require a bound Project. Collector inventory/log/metric reads use host sources; verify their isolation independently of durable Project reads.
- Internal API routes require the API internal token and stored Project grants. API-to-daemon uses a different required token and a loopback-only listener. Durable Work/Fix state uses command hashes, leases and publication recovery; audit is append-only and chained. Review normal, replay, answer, migration and uncertain-effect paths.
- Broker subject/body equality, granted Project intake and bounded schemas protect Event processing. Collectors consume workload metadata/logs and configured metrics. Trace label provenance, deduplication namespaces, retries and downstream state.
- Gateway/agent/diagnoser/patch modules assemble untrusted context, constrain capabilities, account spend, require audit acknowledgment and validate model output. Repository selection uses the instance service mapping; inspect its Project binding. Fixer source snapshots bind deployment/tree/blob identity; path guards, OS sandboxing, workspace checks and verification receipts precede GitHub writes. Publication and recovery must use the same verified object.
- Actuator requests require HMAC, approval, current policy, durable single-use admission and bounded targets. The production launcher currently uses local admission and `durableAudit: false`; do not infer a durable remote handoff from documentation. Actions and one-shot workflows are parallel privileged paths.

## Execution limits and coverage

Do not run target-controlled code, tests, builds, package scripts, containers, browsers or fixtures. Complete OS-enforced memory, process, CPU, per-file, total-disk, filesystem and wall-clock controls have not been established. Network and filesystem declarations in target code are not an audit sandbox. No dependencies will be installed, no deployed/shared endpoints contacted, and no scratch output promoted. All checks are source-only with null artifacts. Any source-grounded candidate requiring behavior or deployment evidence remains `needs_validation` without severity. Trusted parent-side validators may check parent-owned audit JSON.

Selected companions: HTTP/authentication, data isolation/lifecycle, AI/LLM, protocols/messaging, resource availability, supply chain/release, cloud/deployment and local IPC. They match actual identity, project-data, model-action, broker, process, CI, workload and private-daemon boundaries. No browser UI or native unsafe-memory boundary is source-visible in the product. The ledger carries exact selected/excluded blocks per unit. Eleven first-wave hunter assignments cover 65 units; two distinct critic passes and two fresh verification passes per surviving candidate are planned. No strict agent budget is set.


Full current coverage ledger and assignment block maps:
[
  {
    "coverage_id": ".github%2Fworkflows%2Foneshot-reusable.yml%23workflow_call::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::SUPPLY-CHAIN-AND-RELEASE.md%23Build-context%20inclusion",
    "canonical_refs": {
      "surface": ".github/workflows/oneshot-reusable.yml#workflow_call",
      "boundary": "scripts/actions/policy-signature.ts#verifyPolicySignature",
      "subsystem": ".github",
      "attack_class": "SUPPLY-CHAIN-AND-RELEASE.md#Build-context inclusion"
    },
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "subsystem": ".github",
    "attack_class": "Build context and packaged secret exposure",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Cryptography and secrets",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Build-context inclusion",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Build context and packaged secret exposure."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-supply-deploy",
    "reviewed_paths": [
      ".gitignore",
      ".github/workflows/oneshot-reusable.yml",
      "deploy/compose/bun.Dockerfile",
      "deploy/compose/bun.Dockerfile.dockerignore",
      "examples/haunted-candy-shop/Dockerfile",
      "examples/haunted-candy-shop/.dockerignore",
      "packages/core/package.json",
      "packages/events/package.json",
      "packages/redactor/src/index.ts",
      "packages/redactor/src/detectors.ts",
      "scripts/actions/prepare-patch.ts",
      "scripts/actions/one-shot.ts",
      "scripts/finalize-contract.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          ".gitignore",
          "deploy/compose/bun.Dockerfile",
          "deploy/compose/bun.Dockerfile.dockerignore",
          "examples/haunted-candy-shop/Dockerfile",
          "examples/haunted-candy-shop/.dockerignore",
          "packages/core/package.json",
          "packages/events/package.json",
          "scripts/finalize-contract.ts"
        ],
        "invariant": "Image and package inputs must not copy an established real credential or local privileged configuration into an artifact accessible to a lower-trust reader.",
        "method": "source",
        "result": "The shared Dockerfile copies package manifests and apps/packages, uses APP_PATH rather than a credential build argument, and drops to user bun. Its Dockerfile-specific ignore excludes root .env*, .git and .kiro. The demo copies only package.json and src. The public core/events packages declare files allowlists and their finalizer copies LICENSE/NOTICE and rewrites declarations. No real secret disclosure was established in these inspected inputs. Nested ignored files and a produced image/package were not inspected; the broad apps/packages copy is recorded as hardening rather than an invented credential leak. Ignored local env and MCP settings were not read.",
        "artifact": null
      },
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          ".github/workflows/oneshot-reusable.yml",
          "scripts/actions/prepare-patch.ts",
          "scripts/actions/one-shot.ts",
          "packages/redactor/src/index.ts",
          "packages/redactor/src/detectors.ts"
        ],
        "invariant": "The one-shot artifact must contain only the validated sanitized patch, without attaching job credentials or the trusted checkout.",
        "method": "source",
        "result": "prepare-patch.ts:15-38 bounds the input, checks signed policy, validates the patch, redacts file content, validates again, and writes only patch.json. oneshot-reusable.yml:137-142 uploads that exact file with one-day retention. The producer does not serialize process.env, the HMAC key, or a checkout directory. Redaction preserves base identity; its detector coverage is not treated as proof against every possible secret format. No source-visible credential-to-artifact handoff survived this check.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "supply-deploy",
    "priority": 4,
    "priority_reason": "CI and deployment are parallel paths into source mutation, publication tokens and runtime network authority.",
    "hardening_notes": [
      "deploy/compose/bun.Dockerfile copies all apps/packages, while its Dockerfile-specific ignore uses root .env* rather than an explicit recursive nested-secret exclusion. Narrow release inputs or add recursive exclusions for local env/credential artifacts. No ignored secret was read, no actual credential-bearing nested file was established, and no image disclosure is claimed.",
      "apply-patch.ts:71-80 resolves BASE_REF in process.cwd() even though workflow writes and subsequent Git calls use PATCH_WORKSPACE=../target. Existing script fixtures use a single checkout, so they do not establish the two-directory workflow behavior. The source-visible effect is a possible safe publication failure, not a demonstrated unauthorized write.",
      "The documented combined Compose setup also collides on postgres and retains the API profile, command and Dockerfile fields. The unchanged combined run is not established functional. CI validates the two Compose files separately, so it does not settle combined-object behavior. These limitations are retained in the conditional candidate rather than hidden behind a presumed successful deployment.",
      "The actuator proxy's CONTAINERS=1, POST=1, ALLOW_RESTARTS=1 settings require inspection of the pinned external proxy's effective policy. The repository comment alone does not prove restart-only transport, and docker.sock:ro does not independently prevent write requests over a Unix socket. No arbitrary-operation exploit is claimed without a lower-trust source path.",
      "Kubernetes RBAC, permissive egress skeleton, Helm values and kind bootstrap are explicitly incomplete and have no workload attachment. Their broad reads or empty egress rule are dormant scaffold/hardening observations, not evidence of a live cluster or internet exposure.",
      "scripts/kiro/guard-shell.mjs is a substring regex guard, and secret-scan.mjs is post-save and permits unreadable files. They should be described as developer assistance rather than a shell sandbox, full secret prevention control, or publisher boundary. No same-user bypass was elevated to privilege gain.",
      "Mutable image tags, default local/test database placeholders and public-package metadata were not promoted into vulnerabilities without an actor-controlled handoff and affected lower-trust principal. All checks in this result are source inspection; project code, tests, builds, containers, cloud/GitHub commands, external requests and ignored local settings were not used."
    ]
  },
  {
    "coverage_id": ".github%2Fworkflows%2Foneshot-reusable.yml%23workflow_call::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::SUPPLY-CHAIN-AND-RELEASE.md%23Build-to-promotion%20substitution",
    "canonical_refs": {
      "surface": ".github/workflows/oneshot-reusable.yml#workflow_call",
      "boundary": "scripts/actions/policy-signature.ts#verifyPolicySignature",
      "subsystem": ".github",
      "attack_class": "SUPPLY-CHAIN-AND-RELEASE.md#Build-to-promotion substitution"
    },
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "subsystem": ".github",
    "attack_class": "Signed patch and promotion artifact binding",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Build-to-promotion substitution",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Signed patch and promotion artifact binding."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-supply-deploy",
    "reviewed_paths": [
      ".github/workflows/oneshot-reusable.yml",
      ".github/workflows/oneshot.yml",
      "graveshift.config.yaml",
      "packages/config/src/load.ts",
      "packages/patch/src/guard.ts",
      "packages/patch/src/schemas.ts",
      "packages/policy/src/decide.ts",
      "scripts/actions/policy-signature.ts",
      "scripts/actions/prepare-patch.ts",
      "scripts/actions/one-shot.ts",
      "scripts/actions/apply-patch.ts",
      "tests/actions-signature.test.ts",
      "tests/actions-scripts.test.ts",
      "tests/actions-scripts.helpers.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          ".github/workflows/oneshot-reusable.yml",
          ".github/workflows/oneshot.yml",
          "scripts/actions/policy-signature.ts",
          "scripts/actions/prepare-patch.ts",
          "scripts/actions/one-shot.ts",
          "scripts/actions/apply-patch.ts",
          "tests/actions-signature.test.ts"
        ],
        "invariant": "The artifact consumed with publication credentials must be the sanitized derivation of the same signed job and raw patch bytes.",
        "method": "source",
        "result": "policy-signature.ts binds repository, work item, incident, branch, base ref, full base SHA, title, and SHA-256 of raw patch bytes under canonical HMAC-SHA256. Verification requires an adequate key, exact digest encoding, timing-safe comparison, open_pr allow, matching bound fields, and a bounded unexpired lifetime. Both prepare and apply invoke this check. apply-patch.ts:63-69 validates the downloaded artifact and compares its parsed representation with a freshly redacted derivation of the signed payload before writes. A mutable artifact name alone therefore does not supply an artifact-substitution path. Signature tests were read, not executed.",
        "artifact": null
      },
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          "graveshift.config.yaml",
          "packages/config/src/load.ts",
          "packages/patch/src/guard.ts",
          "packages/patch/src/schemas.ts",
          "packages/policy/src/decide.ts",
          "scripts/actions/one-shot.ts",
          "scripts/actions/apply-patch.ts",
          "tests/actions-scripts.test.ts",
          "tests/actions-scripts.helpers.ts"
        ],
        "invariant": "Publication, retry and stale-base paths must retain signed commit/blob identity and must not replace an existing branch with different content.",
        "method": "source",
        "result": "The trusted policy loader fails closed for unknown repositories, and current policy is re-evaluated. Patch schemas and guards require base identity and valid write blob identities. apply-patch.ts checks resolved base identity and signed BASE_SHA, fetches that SHA, compares edited blobs, and checks symlink containment before writing. Existing remote branches are reused only if their tree equals the staged tree; new branches use an absent-ref force-with-lease. Draft creation is explicit and no merge sink exists. The preliminary BASE_REF resolution uses the trusted cwd rather than PATCH_WORKSPACE; that can cause a safe failure and is recorded separately as a correctness note, not a demonstrated substitution. Fixture and retry tests were inspected only.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "supply-deploy",
    "priority": 4,
    "priority_reason": "CI and deployment are parallel paths into source mutation, publication tokens and runtime network authority.",
    "hardening_notes": [
      "deploy/compose/bun.Dockerfile copies all apps/packages, while its Dockerfile-specific ignore uses root .env* rather than an explicit recursive nested-secret exclusion. Narrow release inputs or add recursive exclusions for local env/credential artifacts. No ignored secret was read, no actual credential-bearing nested file was established, and no image disclosure is claimed.",
      "apply-patch.ts:71-80 resolves BASE_REF in process.cwd() even though workflow writes and subsequent Git calls use PATCH_WORKSPACE=../target. Existing script fixtures use a single checkout, so they do not establish the two-directory workflow behavior. The source-visible effect is a possible safe publication failure, not a demonstrated unauthorized write.",
      "The documented combined Compose setup also collides on postgres and retains the API profile, command and Dockerfile fields. The unchanged combined run is not established functional. CI validates the two Compose files separately, so it does not settle combined-object behavior. These limitations are retained in the conditional candidate rather than hidden behind a presumed successful deployment.",
      "The actuator proxy's CONTAINERS=1, POST=1, ALLOW_RESTARTS=1 settings require inspection of the pinned external proxy's effective policy. The repository comment alone does not prove restart-only transport, and docker.sock:ro does not independently prevent write requests over a Unix socket. No arbitrary-operation exploit is claimed without a lower-trust source path.",
      "Kubernetes RBAC, permissive egress skeleton, Helm values and kind bootstrap are explicitly incomplete and have no workload attachment. Their broad reads or empty egress rule are dormant scaffold/hardening observations, not evidence of a live cluster or internet exposure.",
      "scripts/kiro/guard-shell.mjs is a substring regex guard, and secret-scan.mjs is post-save and permits unreadable files. They should be described as developer assistance rather than a shell sandbox, full secret prevention control, or publisher boundary. No same-user bypass was elevated to privilege gain.",
      "Mutable image tags, default local/test database placeholders and public-package metadata were not promoted into vulnerabilities without an actor-controlled handoff and affected lower-trust principal. All checks in this result are source inspection; project code, tests, builds, containers, cloud/GitHub commands, external requests and ignored local settings were not used."
    ]
  },
  {
    "coverage_id": ".github%2Fworkflows%2Foneshot-reusable.yml%23workflow_call::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::SUPPLY-CHAIN-AND-RELEASE.md%23Dependency%20source%20and%20namespace%20confusion",
    "canonical_refs": {
      "surface": ".github/workflows/oneshot-reusable.yml#workflow_call",
      "boundary": "scripts/actions/policy-signature.ts#verifyPolicySignature",
      "subsystem": ".github",
      "attack_class": "SUPPLY-CHAIN-AND-RELEASE.md#Dependency source and namespace confusion"
    },
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "subsystem": ".github",
    "attack_class": "Dependency and generated input trust",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Dependency source and namespace confusion",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Dependency and generated input trust."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-supply-deploy",
    "reviewed_paths": [
      "package.json",
      "bun.lock",
      "bunfig.toml",
      "apps/api/package.json",
      "packages/core/package.json",
      "packages/events/package.json",
      "examples/haunted-candy-shop/package.json",
      "examples/haunted-candy-shop/Dockerfile",
      ".github/actions/setup-bun/action.yml",
      ".github/workflows/ci.yml",
      ".github/workflows/oneshot-reusable.yml",
      "deploy/compose/bun.Dockerfile",
      "scripts/finalize-contract.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          "package.json",
          "bun.lock",
          "bunfig.toml",
          "apps/api/package.json",
          "packages/core/package.json",
          "packages/events/package.json",
          "examples/haunted-candy-shop/package.json"
        ],
        "invariant": "A lower-trust namespace, alternate registry or generated input must not replace a locked workspace dependency consumed by a trusted job.",
        "method": "source",
        "result": "The root pins Bun 1.4.4 and enumerates apps/api, apps/daemon and packages/* as workspaces. bun.lock records the current @graveshift packages as workspace locations, including the events package's semver dependency on core, and external entries include integrity hashes. Searches found no nonempty alternate package-source field, git/file/link dependency source, lock override, or registry redirection in the inspected lock/config. bunfig.toml contains a test preload only. Public core/events publishConfig points explicitly to npm; the example is private and has no dependencies. No attacker-controlled resolver selection feeding privileged execution was established.",
        "artifact": null
      },
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          ".github/actions/setup-bun/action.yml",
          ".github/workflows/ci.yml",
          ".github/workflows/oneshot-reusable.yml",
          "deploy/compose/bun.Dockerfile",
          "examples/haunted-candy-shop/Dockerfile",
          "scripts/finalize-contract.ts"
        ],
        "invariant": "Dependency installation and generated packaging steps in credential-bearing workflows must consume trusted inputs rather than the target checkout or an untrusted persisted cache.",
        "method": "source",
        "result": "The setup action, both one-shot jobs, and the shared image use frozen-lockfile installs. One-shot installation runs in the trusted checkout selected by an administrator-controlled full SHA; the target checkout receives no install/build/test invocation. No cache restore, workflow_run artifact promotion, registry publishing job, or external generated-code download is declared in these workflows. The demo Dockerfile runs no package install. Image tags and dependency versions were not treated as vulnerabilities without an actor-controlled resolution path; no registry or package-manager process was contacted.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "supply-deploy",
    "priority": 4,
    "priority_reason": "CI and deployment are parallel paths into source mutation, publication tokens and runtime network authority.",
    "hardening_notes": [
      "deploy/compose/bun.Dockerfile copies all apps/packages, while its Dockerfile-specific ignore uses root .env* rather than an explicit recursive nested-secret exclusion. Narrow release inputs or add recursive exclusions for local env/credential artifacts. No ignored secret was read, no actual credential-bearing nested file was established, and no image disclosure is claimed.",
      "apply-patch.ts:71-80 resolves BASE_REF in process.cwd() even though workflow writes and subsequent Git calls use PATCH_WORKSPACE=../target. Existing script fixtures use a single checkout, so they do not establish the two-directory workflow behavior. The source-visible effect is a possible safe publication failure, not a demonstrated unauthorized write.",
      "The documented combined Compose setup also collides on postgres and retains the API profile, command and Dockerfile fields. The unchanged combined run is not established functional. CI validates the two Compose files separately, so it does not settle combined-object behavior. These limitations are retained in the conditional candidate rather than hidden behind a presumed successful deployment.",
      "The actuator proxy's CONTAINERS=1, POST=1, ALLOW_RESTARTS=1 settings require inspection of the pinned external proxy's effective policy. The repository comment alone does not prove restart-only transport, and docker.sock:ro does not independently prevent write requests over a Unix socket. No arbitrary-operation exploit is claimed without a lower-trust source path.",
      "Kubernetes RBAC, permissive egress skeleton, Helm values and kind bootstrap are explicitly incomplete and have no workload attachment. Their broad reads or empty egress rule are dormant scaffold/hardening observations, not evidence of a live cluster or internet exposure.",
      "scripts/kiro/guard-shell.mjs is a substring regex guard, and secret-scan.mjs is post-save and permits unreadable files. They should be described as developer assistance rather than a shell sandbox, full secret prevention control, or publisher boundary. No same-user bypass was elevated to privilege gain.",
      "Mutable image tags, default local/test database placeholders and public-package metadata were not promoted into vulnerabilities without an actor-controlled handoff and affected lower-trust principal. All checks in this result are source inspection; project code, tests, builds, containers, cloud/GitHub commands, external requests and ignored local settings were not used."
    ]
  },
  {
    "coverage_id": ".github%2Fworkflows%2Foneshot-reusable.yml%23workflow_call::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::SUPPLY-CHAIN-AND-RELEASE.md%23Untrusted%20code%20in%20a%20privileged%20workflow",
    "canonical_refs": {
      "surface": ".github/workflows/oneshot-reusable.yml#workflow_call",
      "boundary": "scripts/actions/policy-signature.ts#verifyPolicySignature",
      "subsystem": ".github",
      "attack_class": "SUPPLY-CHAIN-AND-RELEASE.md#Untrusted code in a privileged workflow"
    },
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "subsystem": ".github",
    "attack_class": "Privileged workflow code and artifact producer identity",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Untrusted code in a privileged workflow",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Privileged workflow code and artifact producer identity."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-supply-deploy",
    "reviewed_paths": [
      ".github/actions/setup-bun/action.yml",
      ".github/workflows/ci.yml",
      ".github/workflows/pr-hygiene.yml",
      ".github/workflows/codeql.yml",
      ".github/workflows/oneshot-reusable.yml",
      ".github/workflows/oneshot.yml",
      "package.json",
      "scripts/actions/prepare-patch.ts",
      "scripts/actions/apply-patch.ts",
      "scripts/actions/one-shot.ts",
      "packages/config/src/load.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          ".github/actions/setup-bun/action.yml",
          ".github/workflows/ci.yml",
          ".github/workflows/pr-hygiene.yml",
          ".github/workflows/codeql.yml"
        ],
        "invariant": "Contributor code must not be executed by a source-visible PR path that also holds repository publication or application-secret authority.",
        "method": "source",
        "result": "CI uses pull_request and main push with contents:read; its contributor-controlled install/test/build steps have no declared application secrets or publication credentials. The PR label job has pull-requests:write but performs no checkout or contributor code execution, deriving fixed label names from paths-filter outputs. CodeQL declares security-events:write but only pinned checkout/init/analyze actions and no project build step. No pull_request_target, workflow_run, issue-comment execution, or repository_dispatch path was found. Hosted repository protections were not assumed, and ordinary authorized CI computation was not promoted to a finding.",
        "artifact": null
      },
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          ".github/workflows/oneshot-reusable.yml",
          ".github/workflows/oneshot.yml",
          "package.json",
          "scripts/actions/prepare-patch.ts",
          "scripts/actions/apply-patch.ts",
          "scripts/actions/one-shot.ts",
          "packages/config/src/load.ts"
        ],
        "invariant": "One-shot secrets must be given to reviewed workflow code, while mutable target code remains data until draft publication.",
        "method": "source",
        "result": "Both one-shot jobs require an administrator-provided 40-hex trusted revision and a nonempty base-ref allowlist before checkout. Checkouts disable persisted credentials. Bun setup, installs, imports, config loading, and script execution use trusted; target is a separate data directory. The HMAC key is scoped to prepare/apply steps and the PR token to apply/open-PR steps. Target package scripts, hooks, tests and builds are not invoked. Git subprocess arguments and file writes are constructed by trusted scripts, and signed policy is checked again before publication. No lower-trust artifact producer or target-code execution with these secrets was identified in the declared flow.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "supply-deploy",
    "priority": 4,
    "priority_reason": "CI and deployment are parallel paths into source mutation, publication tokens and runtime network authority.",
    "hardening_notes": [
      "deploy/compose/bun.Dockerfile copies all apps/packages, while its Dockerfile-specific ignore uses root .env* rather than an explicit recursive nested-secret exclusion. Narrow release inputs or add recursive exclusions for local env/credential artifacts. No ignored secret was read, no actual credential-bearing nested file was established, and no image disclosure is claimed.",
      "apply-patch.ts:71-80 resolves BASE_REF in process.cwd() even though workflow writes and subsequent Git calls use PATCH_WORKSPACE=../target. Existing script fixtures use a single checkout, so they do not establish the two-directory workflow behavior. The source-visible effect is a possible safe publication failure, not a demonstrated unauthorized write.",
      "The documented combined Compose setup also collides on postgres and retains the API profile, command and Dockerfile fields. The unchanged combined run is not established functional. CI validates the two Compose files separately, so it does not settle combined-object behavior. These limitations are retained in the conditional candidate rather than hidden behind a presumed successful deployment.",
      "The actuator proxy's CONTAINERS=1, POST=1, ALLOW_RESTARTS=1 settings require inspection of the pinned external proxy's effective policy. The repository comment alone does not prove restart-only transport, and docker.sock:ro does not independently prevent write requests over a Unix socket. No arbitrary-operation exploit is claimed without a lower-trust source path.",
      "Kubernetes RBAC, permissive egress skeleton, Helm values and kind bootstrap are explicitly incomplete and have no workload attachment. Their broad reads or empty egress rule are dormant scaffold/hardening observations, not evidence of a live cluster or internet exposure.",
      "scripts/kiro/guard-shell.mjs is a substring regex guard, and secret-scan.mjs is post-save and permits unreadable files. They should be described as developer assistance rather than a shell sandbox, full secret prevention control, or publisher boundary. No same-user bypass was elevated to privilege gain.",
      "Mutable image tags, default local/test database placeholders and public-package metadata were not promoted into vulnerabilities without an actor-controlled handoff and affected lower-trust principal. All checks in this result are source inspection; project code, tests, builds, containers, cloud/GitHub commands, external requests and ignored local settings were not used."
    ]
  },
  {
    "coverage_id": ".github%2Fworkflows%2Foneshot-reusable.yml%23workflow_call::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::SUPPLY-CHAIN-AND-RELEASE.md%23Workflow%20command%20and%20expression%20confusion",
    "canonical_refs": {
      "surface": ".github/workflows/oneshot-reusable.yml#workflow_call",
      "boundary": "scripts/actions/policy-signature.ts#verifyPolicySignature",
      "subsystem": ".github",
      "attack_class": "SUPPLY-CHAIN-AND-RELEASE.md#Workflow command and expression confusion"
    },
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "subsystem": ".github",
    "attack_class": "Workflow expression, shell and path input handling",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Injection",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Workflow command and expression confusion",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Workflow expression, shell and path input handling."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-supply-deploy",
    "reviewed_paths": [
      ".github/workflows/oneshot-reusable.yml",
      ".github/workflows/oneshot.yml",
      ".github/workflows/pr-hygiene.yml",
      "graveshift.config.yaml",
      "scripts/actions/policy-signature.ts",
      "scripts/actions/one-shot.ts",
      "scripts/actions/apply-patch.ts",
      "packages/patch/src/guard.ts",
      "packages/patch/src/schemas.ts",
      "tests/actions-workflows.test.ts",
      "tests/actions-scripts.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          ".github/workflows/oneshot-reusable.yml",
          ".github/workflows/oneshot.yml",
          ".github/workflows/pr-hygiene.yml",
          "scripts/actions/policy-signature.ts",
          "tests/actions-workflows.test.ts"
        ],
        "invariant": "Workflow inputs and generated outputs must not become shell source, injected workflow commands or executable expressions.",
        "method": "source",
        "result": "One-shot inputs enter fixed env fields; run blocks contain no embedded workflow expressions. BASE_REF is character-restricted and matched against the configured allowlist before its single-line GITHUB_OUTPUT write. Trusted SHA output is restricted to exactly 40 lowercase hex characters. Branch, title, work item and base are quoted in gh arguments; the commit message is an argv value rather than shell text. pr-hygiene's script interpolates JSON-encoded outputs whose label keys are fixed by the workflow. The encoded Git authorization value is masked before credential-bearing Git operations. No source-visible input-to-shell or output-file injection reached a privileged sink.",
        "artifact": null
      },
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          "graveshift.config.yaml",
          "scripts/actions/one-shot.ts",
          "scripts/actions/apply-patch.ts",
          "packages/patch/src/guard.ts",
          "packages/patch/src/schemas.ts",
          "tests/actions-workflows.test.ts",
          "tests/actions-scripts.test.ts"
        ],
        "invariant": "A signed patch or ref must not escape its allowed workspace, redirect Git options, traverse a symlink, or bypass repository path and size rules.",
        "method": "source",
        "result": "TypeScript ref guards reject empty/dot/dot-dot path segments and constrain branch names to graveshift/. Patch parsing is strict, payload size is capped, duplicate paths are rejected case-insensitively, and absolute/backslash/NUL/dot-segment paths fail. Current trusted rules allow only src/config/migrations/test paths and deny workflow, deploy and secret-file patterns. apply uses argv Git calls, checks real workspace containment and every existing path component for symlinks, then verifies real parent containment before writing. Existing and dangling symlink tests were read only. No source-grounded escaping path survived these controls.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "supply-deploy",
    "priority": 4,
    "priority_reason": "CI and deployment are parallel paths into source mutation, publication tokens and runtime network authority.",
    "hardening_notes": [
      "deploy/compose/bun.Dockerfile copies all apps/packages, while its Dockerfile-specific ignore uses root .env* rather than an explicit recursive nested-secret exclusion. Narrow release inputs or add recursive exclusions for local env/credential artifacts. No ignored secret was read, no actual credential-bearing nested file was established, and no image disclosure is claimed.",
      "apply-patch.ts:71-80 resolves BASE_REF in process.cwd() even though workflow writes and subsequent Git calls use PATCH_WORKSPACE=../target. Existing script fixtures use a single checkout, so they do not establish the two-directory workflow behavior. The source-visible effect is a possible safe publication failure, not a demonstrated unauthorized write.",
      "The documented combined Compose setup also collides on postgres and retains the API profile, command and Dockerfile fields. The unchanged combined run is not established functional. CI validates the two Compose files separately, so it does not settle combined-object behavior. These limitations are retained in the conditional candidate rather than hidden behind a presumed successful deployment.",
      "The actuator proxy's CONTAINERS=1, POST=1, ALLOW_RESTARTS=1 settings require inspection of the pinned external proxy's effective policy. The repository comment alone does not prove restart-only transport, and docker.sock:ro does not independently prevent write requests over a Unix socket. No arbitrary-operation exploit is claimed without a lower-trust source path.",
      "Kubernetes RBAC, permissive egress skeleton, Helm values and kind bootstrap are explicitly incomplete and have no workload attachment. Their broad reads or empty egress rule are dormant scaffold/hardening observations, not evidence of a live cluster or internet exposure.",
      "scripts/kiro/guard-shell.mjs is a substring regex guard, and secret-scan.mjs is post-save and permits unreadable files. They should be described as developer assistance rather than a shell sandbox, full secret prevention control, or publisher boundary. No same-user bypass was elevated to privilege gain.",
      "Mutable image tags, default local/test database placeholders and public-package metadata were not promoted into vulnerabilities without an actor-controlled handoff and affected lower-trust principal. All checks in this result are source inspection; project code, tests, builds, containers, cloud/GitHub commands, external requests and ignored local settings were not used."
    ]
  },
  {
    "coverage_id": ".kiro%2Fhooks%2Fblock-dangerous-shell.json%23hooks::scripts%2Fkiro%2Fguard-shell.mjs%23run::.kiro%2Fhooks::SUPPLY-CHAIN-AND-RELEASE.md%23Plugin%20and%20extension%20trust%20expansion",
    "canonical_refs": {
      "surface": ".kiro/hooks/block-dangerous-shell.json#hooks",
      "boundary": "scripts/kiro/guard-shell.mjs#run",
      "subsystem": ".kiro/hooks",
      "attack_class": "SUPPLY-CHAIN-AND-RELEASE.md#Plugin and extension trust expansion"
    },
    "surface": "Kiro development agents and command/save hooks",
    "boundary": "Lower-trust tool/save event data and restricted-agent source writes to developer-host hook commands and security-control decisions",
    "subsystem": ".kiro/hooks",
    "attack_class": "Kiro hook event-shape binding and fail-open enforcement",
    "starting_paths": [
      ".kiro/agents/chaos-witch.json",
      ".kiro/agents/docs-scribe.json",
      ".kiro/agents/sre-reviewer.json",
      ".kiro/hooks/block-dangerous-shell.json",
      ".kiro/hooks/secret-scan-on-save.json",
      ".kiro/hooks/typecheck-on-save.json",
      ".kiro/hooks/pbt-on-guardrails.json",
      "scripts/kiro/guard-shell.mjs",
      "scripts/kiro/secret-scan.mjs"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Wildcard",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Plugin and extension trust expansion",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 2,
    "status": "candidate",
    "agent_id": "hunt-kiro-hooks",
    "reviewed_paths": [
      ".kiro/hooks/block-dangerous-shell.json",
      ".kiro/hooks/secret-scan-on-save.json",
      ".kiro/hooks/typecheck-on-save.json",
      ".kiro/hooks/pbt-on-guardrails.json",
      ".kiro/hooks/policy-drift.json",
      ".kiro/hooks/test-companion.json",
      ".kiro/hooks/spec-task-done.json",
      "scripts/kiro/guard-shell.mjs",
      "KIRO_USAGE.md",
      "scripts/kiro/secret-scan.mjs",
      "docs/SECURITY.md",
      ".kiro/agents/chaos-witch.json",
      ".kiro/agents/docs-scribe.json",
      ".kiro/agents/sre-reviewer.json",
      ".kiro/steering/safety.md",
      ".kiro/steering/structure.md",
      ".gitignore"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-kiro-hooks",
        "reviewed_paths": [
          ".kiro/hooks/block-dangerous-shell.json",
          ".kiro/hooks/secret-scan-on-save.json",
          ".kiro/hooks/typecheck-on-save.json",
          ".kiro/hooks/pbt-on-guardrails.json",
          ".kiro/hooks/policy-drift.json",
          ".kiro/hooks/test-companion.json",
          ".kiro/hooks/spec-task-done.json"
        ],
        "invariant": "Hook `action.command` strings are fixed tracked configuration with no event-controlled interpolation, and restricted agents' allowed write paths do not include `.kiro/hooks` or `scripts/kiro`.",
        "method": "source",
        "result": "All seven hook files declare a fixed `matcher` and fixed `action` (four `type: command` with literal command strings, three `type: agent` with literal prompts). No hook command contains a placeholder, variable, or stdin-derived value. The command hooks invoke `node scripts/kiro/guard-shell.mjs`, `node scripts/kiro/secret-scan.mjs`, `bun check && bun lint --no-script`, and `bun test --check ...` as literal strings. Event data can therefore influence only the scripts' stdin, not the command that is executed. The two agent-type hooks (`policy-drift`, `test-companion`) run fixed prompts on PostFileSave and do not accept event text as a prompt parameter. The ignored local `.kiro/settings/mcp.json` was not read; only the tracked hook JSON files were reviewed.",
        "artifact": null
      },
      {
        "agent_id": "hunt-kiro-hooks",
        "reviewed_paths": [
          "scripts/kiro/guard-shell.mjs",
          "KIRO_USAGE.md"
        ],
        "invariant": "The PreToolUse shell guard binds to a documented hook event schema and denies enumerated destructive shell commands before permitting the tool.",
        "method": "source",
        "result": "No Kiro event schema, payload fixture, or vendor runtime source exists in the repository. `extractCommand` guesses eight JSON locations (`command`, `shell`, `input.command`, `tool_input.command`, `toolInput.command`, `arguments.command`, `args.command`, `parameters.command`) and returns '' when none is present; `readStdin` maps any read error to ''; a non-string/non-object parse result also yields ''. `command.match(DANGEROUS)` is a single literal regex, and an empty command or a miss reaches `process.exit(0)` (allow). The regex covers only `docker rm/rmi/system prune`, `kubectl delete`, `helm uninstall`, two `git push` force/main forms, and `rm -rf /` followed by whitespace or end; equivalent forms such as `rm -rf /;true`, `git push origin +main`, `git -c foo=bar push origin main`, and `kubectl -n ns delete pod` do not match. The only statement that exit 2 blocks and exit 1 only warns is repo-authored (`scripts/kiro/guard-shell.mjs:1-2`, `KIRO_USAGE.md:13,38`), not source-visible Kiro behavior. This leaves an event-shape-dependent, fail-open control; decisive Kiro facts are external, so the result is a needs_validation candidate rather than a confirmed finding.",
        "artifact": null
      },
      {
        "agent_id": "hunt-kiro-hooks",
        "reviewed_paths": [
          "scripts/kiro/secret-scan.mjs",
          "docs/SECURITY.md"
        ],
        "invariant": "The PostFileSave secret scanner binds to a documented save-event shape and reads only the file actually saved, failing closed on malformed events.",
        "method": "source",
        "result": "The same unverified-shape pattern appears in the sibling save hook: `extractPath` probes twelve guessed field names and returns '' on a miss or non-object; `filePath` is passed directly to `readFileSync(filePath)` with the hook process's privileges, so any path carried in the event is read. `process.exit(0)` is used for no path, an unreadable/missing file, and no pattern match (fail-open for each). The script reports only pattern name, path, and line number (no file content), so no secret value is disclosed on this path; the source-visible concern is an arbitrary-path read/existence oracle driven by event data. `docs/SECURITY.md:13` asserts the hook exists but documents no event schema or principal. This reinforces the same root cause (unverified event-shape binding with fail-open exits) rather than establishing a separate confirmed defect.",
        "artifact": null
      },
      {
        "agent_id": "hunt-kiro-hooks",
        "reviewed_paths": [
          ".kiro/agents/chaos-witch.json",
          ".kiro/agents/docs-scribe.json",
          ".kiro/agents/sre-reviewer.json",
          ".kiro/steering/safety.md",
          ".kiro/steering/structure.md",
          ".gitignore"
        ],
        "invariant": "Restricted agents cannot write the hook configuration or guard scripts, and the strongest source-visible control prevents a restricted principal from replacing the security-control commands.",
        "method": "source",
        "result": "All three restricted agents deny the `shell` capability (`match: ['*']`) and deny `fs_write` on `**`; `chaos-witch` excludes only `examples/**`, `docs-scribe` excludes only `README.md`, `docs/**`, and `KIRO_USAGE.md`, and `sre-reviewer` has no exclusion. None of those allowed paths contains `.kiro/hooks/` or `scripts/kiro/`, so even under the declared rules a restricted agent cannot edit a hook command. All three set `includeMcpJson: false`. `.kiro/steering/safety.md` restates the never-commit-secrets rule and `.kiro/steering/structure.md` records that hooks live in `.kiro/hooks/` with helpers in `scripts/kiro/`. `.gitignore:16-17` keeps only the local MCP settings files out of the repository. Whether Kiro actually enforces these declarative `permissions.rules` is vendor behavior not visible in source, so this check establishes the declared control but not its runtime enforcement.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "kiro-hooks.guard-shell.event-shape-fail-open"
    ],
    "unresolved": [
      "Kiro CLI v3 PreToolUse/PostFileSave stdin event schema is not in the repository; the eight and twelve guessed field names cannot be verified against the real payload.",
      "Exit-code semantics (2 blocks, 1 warns) and the behavior on hook launch failure, timeout, or non-2 exit are asserted only in repo-authored docs/comments, not in source-visible Kiro runtime code.",
      "The principal, working directory, PATH/environment, and shell used to execute `action.command` are not declared in tracked hooks; the relative script path presumes cwd is the repo root.",
      "No OS-enforced process/memory/disk sandbox is available, so no bounded local observation of the guard with a representative real Kiro event was performed."
    ],
    "assignment_group": "kiro-hooks",
    "priority": 5,
    "priority_reason": "A source-only baseline pass found a distinct developer-host boundary that is not covered by runtime HTTP, MCP or CI units; malformed or missing hook input may fail open.",
    "hardening_notes": [
      "The guard is a finite literal denylist; even after the event-shape fact is settled, semantically destructive forms (flag reordering, refspec `+`, shell quoting/escaping, namespace flags) are not matched. Parse/normalize the command before matching, and fail closed when the command cannot be identified.",
      "scripts/kiro/secret-scan.mjs passes an event-supplied path directly to readFileSync with hook-process privileges. Resolve and verify the path against the reported saved file and an allowlisted workspace, even though this path only emits a pattern name, path, and line number rather than file content.",
      "The command hooks invoke `node`, `bun`, and relative script paths through PATH with an undeclared cwd. Pin the interpreter and resolve paths from the repository root so an unexpected cwd or PATH fails closed instead of silently skipping the control.",
      "The restricted agents' shell/fs_write denials and `includeMcpJson: false` are declarative configuration. Until Kiro's enforcement is confirmed from vendor source, they should not be treated as a proven containment boundary for source writes near hook configuration."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fprisma%2Fmigrations%23identity-and-architecture-migrations::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::DATA-ISOLATION-AND-LIFECYCLE.md%23Migration%20default%20and%20ownership%20confusion",
    "canonical_refs": {
      "surface": "apps/api/prisma/migrations#identity-and-architecture-migrations",
      "boundary": "apps/api/src/internal/project-grant.ts#ProjectGrant",
      "subsystem": "apps/api/src/work-items",
      "attack_class": "DATA-ISOLATION-AND-LIFECYCLE.md#Migration default and ownership confusion"
    },
    "surface": "Work item, Deployment, Haunting, Audit, and private durable-state routes",
    "boundary": "Bound Project callers and daemon commands to durable Project data and fix lifecycle",
    "subsystem": "apps/api/src/work-items",
    "attack_class": "Migration ownership and scope preservation",
    "starting_paths": [
      "apps/api/src/work-items",
      "apps/api/src/fix",
      "apps/api/src/deploys",
      "apps/api/src/hauntings",
      "apps/api/src/audit",
      "apps/api/src/internal",
      "apps/api/prisma"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "DATA-ISOLATION-AND-LIFECYCLE.md#Core discipline",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Migration default and ownership confusion",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Universal moves",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/work-items; this unit covers Migration ownership and scope preservation."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "blocked",
    "agent_id": "hunt-data-work",
    "reviewed_paths": [
      "apps/api/prisma/migrations/20261121052714_init/migration.sql",
      "apps/api/prisma/migrations/20261122000000_architecture/migration.sql",
      "apps/api/prisma/migrations/20261122010000_identity/migration.sql",
      "apps/api/prisma/migrations/20261122120000_v3_deployments/migration.sql",
      "apps/api/prisma/schema.prisma",
      "apps/api/src/identity/repo/identity.repo.ts",
      "apps/api/src/identity/services/identity.service.ts",
      "apps/api/src/main.ts",
      "apps/api/src/internal/project-grant.ts",
      "apps/api/test/database/identity-migration.db.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/prisma/migrations/20261121052714_init/migration.sql",
          "apps/api/prisma/migrations/20261122000000_architecture/migration.sql",
          "apps/api/prisma/migrations/20261122010000_identity/migration.sql",
          "apps/api/prisma/migrations/20261122120000_v3_deployments/migration.sql",
          "apps/api/prisma/schema.prisma",
          "apps/api/src/identity/repo/identity.repo.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/src/main.ts",
          "apps/api/src/internal/project-grant.ts"
        ],
        "invariant": "A completed identity migration preserves distinct Project scopes, assigns an explicit owner and stored integration grant, and admits no legacy or missing-scope fallback.",
        "method": "source",
        "result": "The identity SQL builds one sequence-backed numeric mapping from the union of all seven legacy project_id tables, rewrites those tables, creates explicitly owned migrated Projects and a default grant containing their new IDs. Architecture foreign keys bind Fix attempts and receipts to the same Project as their Work item. Root adoption is part of bootstrapRoot's database transaction and main awaits bootstrap before listening. ProjectGrant requires a numeric ID and exact stored-grant membership. The Deployment migration adds a Project foreign key and prevents Organization moves for linked Projects. These completed-state paths do not expose a source-visible default that gives a public caller another Organization's records.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/prisma/migrations/20261122010000_identity/migration.sql",
          "apps/api/test/database/identity-migration.db.test.ts"
        ],
        "invariant": "A failed or resumed rewrite must leave Project ownership, grants and append-only audit enforcement in one consistent state.",
        "method": "source",
        "result": "The rewrite temporarily removes both audit mutation triggers and later restores them, but its SQL file declares no BEGIN/COMMIT boundary. The source test extracts the rewrite and explicitly supplies its own Prisma transaction, including for its injected late failure. That test source establishes the intended rollback contract, not the transaction behavior of the actual migration runner. No migration or test was executed, so failure/resume atomicity remains a coverage blocker rather than a vulnerability claim.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [
      "Establish whether the deployed Prisma migration runner submits the complete identity rewrite as one atomic database unit, including trigger removal/restoration and grant creation, and whether a late failure followed by retry preserves that contract. The SQL file has no explicit transaction boundary and the inspected regression supplies a test-owned transaction. A bounded replay cannot run here because complete memory and cumulative disk sandbox controls are unavailable, target execution is prohibited, and no evidence promotion is permitted."
    ],
    "assignment_group": "data-work",
    "priority": 4,
    "priority_reason": "Public and internal state paths carry tenant isolation, durable authorization, and irreversible publication state.",
    "hardening_notes": [
      "Add a source regression spanning an initial awaiting_answer or publication_uncertain reply and its later answer/reconciliation through AuditedWorkCommands. fix.audit.ts:62 keys fix.outcome only by attempt/trigger, while AuditRepo rejects different facts under the same key. The later lifecycle result changes those facts, so review whether nonterminal replies should use a separate transition key or defer the terminal outcome entry. This is a response/audit-lifecycle correctness concern here: pre-effect intent and durable Work transition audit remain present, and no unauthorized effect was established.",
      "Exercise the actual identity-migration runner with overlapping old numeric IDs, a failure after trigger removal, and retry, rather than proving rollback only by wrapping the extracted SQL block in a test-owned transaction. Keep this as a migration-coverage task until an affected unauthorized principal/resource is established.",
      "Make DeployRepo.list require an explicit Project selector, or expose an explicit separate privileged enumeration operation. Current Deployment routes always pass a verified route Project, so the optional unfiltered repository form is not a current access-control finding."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fcredentials.controller.ts%23CredentialsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fcredential.service.ts%23CredentialService::apps%2Fapi%2Fsrc%2Fauth::ATTACK-CLASSES.md%23Cryptography%20and%20secrets",
    "canonical_refs": {
      "surface": "apps/api/src/auth/controllers/credentials.controller.ts#CredentialsController",
      "boundary": "apps/api/src/auth/services/credential.service.ts#CredentialService",
      "subsystem": "apps/api/src/auth",
      "attack_class": "ATTACK-CLASSES.md#Cryptography and secrets"
    },
    "surface": "OAuth exchange, Credential issue/list/revoke, and config export",
    "boundary": "OAuth and Credential holders to bound Project scopes and secret config",
    "subsystem": "apps/api/src/auth",
    "attack_class": "Credential cryptography and secret handling",
    "starting_paths": [
      "apps/api/src/auth",
      "apps/api/src/config",
      "apps/api/src/internal/internal-config.controller.ts",
      "apps/api/test/credentials.e2e.test.ts",
      "apps/api/test/config-guard.e2e.test.ts",
      "apps/api/test/config-secret.e2e.test.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Cryptography and secrets",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/auth; this unit covers Credential cryptography and secret handling."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-credentials",
    "reviewed_paths": [
      "apps/api/prisma/schema.prisma",
      "apps/api/src/auth/auth.config.ts",
      "apps/api/src/auth/auth.schema.ts",
      "apps/api/src/auth/auth.types.ts",
      "apps/api/src/auth/controllers/credentials.controller.ts",
      "apps/api/src/auth/credential-core.module.ts",
      "apps/api/src/auth/env.schema.ts",
      "apps/api/src/auth/repo/credential.database.spec.ts",
      "apps/api/src/auth/repo/credential.repo.ts",
      "apps/api/src/auth/services/credential.service.spec.ts",
      "apps/api/src/auth/services/credential.service.ts",
      "apps/api/src/auth/services/oauth-token.service.ts",
      "apps/api/src/config/env.schema.ts",
      "apps/api/src/identity/services/identity.service.ts",
      "docs/adr/0013-credentials-in-database.md"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/auth/services/credential.service.ts",
          "apps/api/src/auth/services/oauth-token.service.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/src/auth/auth.config.ts",
          "apps/api/src/auth/env.schema.ts",
          "apps/api/src/config/env.schema.ts"
        ],
        "invariant": "An unauthenticated caller cannot predict a Credential or OAuth client secret, bypass secret verification, or obtain a token through a missing-key fallback.",
        "method": "source",
        "result": "CredentialService.issue generates 32 random bytes at credential.service.ts:71, stores their SHA-256 digest, and uses a separate random UUID as the non-secret record id. IdentityService.createOAuthClient likewise generates 32 random bytes and persists only their digest at identity.service.ts:189-197. OAuth exchange compares a SHA-256 digest with timingSafeEqual at oauth-token.service.ts:44-48 and signs an HS256 token with explicit issuer, audience and a 300-second lifetime at lines 34-40. The root environment schema requires a non-placeholder JWT secret of at least 32 characters, and createAuthConfig obtains it with getOrThrow. Errors propagate; none of these paths falls back to an unsigned token, predictable Credential or default production signing key.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/auth/services/credential.service.ts",
          "apps/api/src/auth/repo/credential.repo.ts",
          "apps/api/prisma/schema.prisma",
          "apps/api/src/auth/controllers/credentials.controller.ts",
          "apps/api/src/auth/auth.types.ts",
          "apps/api/src/auth/auth.schema.ts"
        ],
        "invariant": "Only possession of the full random Credential authenticates; database records, prefixes, listing responses and audit events do not reveal a reusable Credential value.",
        "method": "source",
        "result": "verify rejects any value outside the exact 64-character lowercase hexadecimal format, performs a full SHA-256 lookup, and compares two 32-byte digests with timingSafeEqual at credential.service.ts:103-117 and 158-161. The prefix is never an authentication selector. The Credential model has hash and prefix fields but no raw-value field. Repository create/revoke/expiry audit payloads at credential.repo.ts:116-127, 151-155 and 184-188 contain metadata rather than the value or hash. The authenticated issuance response deliberately returns value once after repo.add resolves; list maps through the explicit metadata projection at credential.service.ts:164-174. Neither response schema nor metadata type includes a hash.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/auth/credential-core.module.ts",
          "apps/api/src/auth/services/credential.service.spec.ts",
          "apps/api/src/auth/repo/credential.database.spec.ts",
          "docs/adr/0013-credentials-in-database.md"
        ],
        "invariant": "The running credential component uses the hashed PostgreSQL store and preserves the documented no-plaintext-storage contract across failure and restart paths.",
        "method": "source",
        "result": "CredentialCoreModule registers one CredentialService and binds CREDENTIAL_REPO to PrismaCredentialRepo, with the Sentry verifier using that same service. ADR 0013:7 and :17 explicitly require one-way storage and no file fallback. Reviewed test source covers hash-only storage, wrong-kind rejection, restart persistence and audit rollback, including credential.database.spec.ts:60-75 and 113-124. These tests were read, not executed; no local behavioral result is claimed. No source-grounded cryptographic or secret-storage candidate survived.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "credentials",
    "priority": 2,
    "priority_reason": "Credentials and config export protect high-value authority and secrets; grant narrowing and revocation need explicit review.",
    "hardening_notes": [
      "Consider declaring Cache-Control: no-store directly on successful OAuth-token and Credential-issuance responses in apps/api/src/auth/controllers/oauth.controller.ts and credentials.controller.ts. These controllers and configureApp do not set an explicit no-store policy. No unauthorized cache reader or deployed cache behavior was demonstrated, so this is a hardening note rather than a candidate.",
      "Before adding OAuth-client deletion or grant-downgrade APIs, define whether they cascade to previously issued Credentials. CredentialService.verify currently checks the independent Credential record, and the Credential model has no parent-client foreign key; current public identity routes expose neither transition. If cascading revocation becomes a product guarantee, enforce it at the shared verifier or in the same transaction as the parent change and add a dummy-client regression case. No current cascading guarantee or source-visible violating API transition was established."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fcredentials.controller.ts%23CredentialsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fcredential.service.ts%23CredentialService::apps%2Fapi%2Fsrc%2Fauth::DATA-ISOLATION-AND-LIFECYCLE.md%23Stale%20authorization%20and%20derived%20copy%20use",
    "canonical_refs": {
      "surface": "apps/api/src/auth/controllers/credentials.controller.ts#CredentialsController",
      "boundary": "apps/api/src/auth/services/credential.service.ts#CredentialService",
      "subsystem": "apps/api/src/auth",
      "attack_class": "DATA-ISOLATION-AND-LIFECYCLE.md#Stale authorization and derived copy use"
    },
    "surface": "OAuth exchange, Credential issue/list/revoke, and config export",
    "boundary": "OAuth and Credential holders to bound Project scopes and secret config",
    "subsystem": "apps/api/src/auth",
    "attack_class": "Credential revocation and current-grant use",
    "starting_paths": [
      "apps/api/src/auth",
      "apps/api/src/config",
      "apps/api/src/internal/internal-config.controller.ts",
      "apps/api/test/credentials.e2e.test.ts",
      "apps/api/test/config-guard.e2e.test.ts",
      "apps/api/test/config-secret.e2e.test.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "DATA-ISOLATION-AND-LIFECYCLE.md#Core discipline",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Stale authorization and derived copy use",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Universal moves",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/auth; this unit covers Credential revocation and current-grant use."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-credentials",
    "reviewed_paths": [
      "apps/api/prisma/schema.prisma",
      "apps/api/src/audit/audit.module.ts",
      "apps/api/src/audit/audit.repo.ts",
      "apps/api/src/audit/audit.transaction.ts",
      "apps/api/src/auth/credential-core.module.ts",
      "apps/api/src/auth/oauth-client-access.strategy.ts",
      "apps/api/src/auth/oauth-client-credentials.strategy.ts",
      "apps/api/src/auth/oauth-principal.ts",
      "apps/api/src/auth/plugin-api-key.guard.ts",
      "apps/api/src/auth/repo/credential.database.spec.ts",
      "apps/api/src/auth/repo/credential.repo.ts",
      "apps/api/src/auth/scopes.ts",
      "apps/api/src/auth/sentry-key.guard.ts",
      "apps/api/src/auth/services/credential.service.ts",
      "apps/api/src/auth/throttle-key.generator.spec.ts",
      "apps/api/src/auth/throttle-key.generator.ts",
      "apps/api/src/identity/controllers/organizations.controller.ts",
      "apps/api/src/identity/repo/identity.repo.ts",
      "apps/api/src/identity/services/identity.service.ts",
      "apps/api/src/mcp/mcp-token.verifier.ts",
      "apps/api/src/mcp/mcp.module.ts",
      "docs/adr/0013-credentials-in-database.md"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/auth/services/credential.service.ts",
          "apps/api/src/auth/repo/credential.repo.ts",
          "apps/api/src/audit/audit.module.ts",
          "apps/api/src/audit/audit.repo.ts",
          "apps/api/src/audit/audit.transaction.ts",
          "docs/adr/0013-credentials-in-database.md"
        ],
        "invariant": "After successful Credential revocation or expiry, a subsequent verification cannot authorize from a stale process copy, and a failed revoke cannot claim a committed state change.",
        "method": "source",
        "result": "Every verify calls repo.findByHash, which reads PostgreSQL, then requires revokedAt to be null and expiry to be strictly later than Date.now at credential.service.ts:108-117 and 151-155. The equality boundary therefore expires closed. Revocation queries and updates include id, clientId and projectId; the update and its audit append share audit.transaction at credential.repo.ts:132-158. AuditModule binds the real AuditRepo, whose transaction calls the serializable Prisma transaction helper at audit.transaction.ts:13-17. A failed append propagates through that transaction. Expiry-audit updates are conditional and idempotent; failure to record the audit does not return an authenticated principal. This matches ADR 0013's shared-state revocation contract.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/auth/throttle-key.generator.ts",
          "apps/api/src/auth/plugin-api-key.guard.ts",
          "apps/api/src/auth/sentry-key.guard.ts",
          "apps/api/src/auth/credential-core.module.ts",
          "apps/api/src/mcp/mcp-token.verifier.ts",
          "apps/api/src/mcp/mcp.module.ts",
          "apps/api/src/auth/services/credential.service.ts"
        ],
        "invariant": "A warm throttler identity, request-local principal, or alternate Credential consumer must not replace the current database-backed authentication decision for a new request.",
        "method": "source",
        "result": "The service's bounded clientIndex contains digests and client identifiers only and is not consulted by verify. ThrottleKeyGenerator.track itself calls verify before setting credentialPrincipal on the current request. PluginApiKeyGuard reuses only that request-local result and checks kind and publish scope; it otherwise verifies again. SentryKeyGuard directly invokes the shared verifier with expectedKind plugin. The MCP bearer guard invokes verify with expectedKind mcp, and mcp.module.ts:87-90 registers that guard on the HTTP surface. No cross-request authorization cache or alternate file-backed Credential store is present in these handoffs. The review stops at these credential-consumer decisions; it does not claim a separate review of MCP data dispatch.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/auth/oauth-principal.ts",
          "apps/api/src/auth/oauth-client-credentials.strategy.ts",
          "apps/api/src/auth/oauth-client-access.strategy.ts",
          "apps/api/src/auth/scopes.ts",
          "apps/api/src/identity/repo/identity.repo.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/src/identity/controllers/organizations.controller.ts",
          "apps/api/prisma/schema.prisma",
          "apps/api/src/auth/services/credential.service.ts"
        ],
        "invariant": "An OAuth management or config token cannot continue to use a Project or scope that its current registered client does not grant; a parent-lifecycle claim must identify a supported transition and an explicit cascading guarantee.",
        "method": "source",
        "result": "verifyOAuthPrincipal performs a fresh client lookup and rejects absent clients, changed Project bindings and token scopes outside the current expanded grant at oauth-principal.ts:35-45. Both assigned OAuth strategies use this helper. Independently issued Credentials carry their own stored scopes, expiry and revokedAt. The production identity repository and Organization controller expose client creation/lookup, with no client deletion, scope-edit or membership-removal transition. The Credential table has no OAuth-client foreign key, but the reviewed contract does not promise cascading parent-client revocation. An operator's arbitrary database change alone does not establish the required product-boundary violation, so this possible future lifecycle behavior is not promoted to a candidate.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/auth/repo/credential.database.spec.ts",
          "apps/api/src/auth/throttle-key.generator.spec.ts"
        ],
        "invariant": "Revocation remains an authentication denial after another instance, process restart, warm lookup, repeated revoke and failed audit transaction.",
        "method": "source",
        "result": "Reviewed test source specifies cross-client and restart revocation at credential.database.spec.ts:78-94, foreign-owner rejection at 96-110, rollback at 113-124, and expiry idempotence at 127-150. throttle-key.generator.spec.ts:62-80 specifies that warm, revoked and expired values return to the anonymous bucket rather than preserving authorization. Tests were not run because the assignment blocks target execution. No stale-authorization candidate remained after tracing the source controls.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "credentials",
    "priority": 2,
    "priority_reason": "Credentials and config export protect high-value authority and secrets; grant narrowing and revocation need explicit review.",
    "hardening_notes": [
      "Consider declaring Cache-Control: no-store directly on successful OAuth-token and Credential-issuance responses in apps/api/src/auth/controllers/oauth.controller.ts and credentials.controller.ts. These controllers and configureApp do not set an explicit no-store policy. No unauthorized cache reader or deployed cache behavior was demonstrated, so this is a hardening note rather than a candidate.",
      "Before adding OAuth-client deletion or grant-downgrade APIs, define whether they cascade to previously issued Credentials. CredentialService.verify currently checks the independent Credential record, and the Credential model has no parent-client foreign key; current public identity routes expose neither transition. If cascading revocation becomes a product guarantee, enforce it at the shared verifier or in the same transaction as the parent change and add a dummy-client regression case. No current cascading guarantee or source-visible violating API transition was established."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fcredentials.controller.ts%23CredentialsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fcredential.service.ts%23CredentialService::apps%2Fapi%2Fsrc%2Fauth::WEB-PROTOCOL-AND-AUTH.md%23API-key%20exposure%20and%20unsafe%20transport",
    "canonical_refs": {
      "surface": "apps/api/src/auth/controllers/credentials.controller.ts#CredentialsController",
      "boundary": "apps/api/src/auth/services/credential.service.ts#CredentialService",
      "subsystem": "apps/api/src/auth",
      "attack_class": "WEB-PROTOCOL-AND-AUTH.md#API-key exposure and unsafe transport"
    },
    "surface": "OAuth exchange, Credential issue/list/revoke, and config export",
    "boundary": "OAuth and Credential holders to bound Project scopes and secret config",
    "subsystem": "apps/api/src/auth",
    "attack_class": "Credential exposure across output paths",
    "starting_paths": [
      "apps/api/src/auth",
      "apps/api/src/config",
      "apps/api/src/internal/internal-config.controller.ts",
      "apps/api/test/credentials.e2e.test.ts",
      "apps/api/test/config-guard.e2e.test.ts",
      "apps/api/test/config-secret.e2e.test.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
    "selected_companion_blocks": [
      "WEB-PROTOCOL-AND-AUTH.md#Core discipline",
      "WEB-PROTOCOL-AND-AUTH.md#API-key exposure and unsafe transport",
      "WEB-PROTOCOL-AND-AUTH.md#Universal moves",
      "WEB-PROTOCOL-AND-AUTH.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/auth; this unit covers Credential exposure across output paths."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-credentials",
    "reviewed_paths": [
      "apps/api/src/app.factory.ts",
      "apps/api/src/auth/auth.schema.ts",
      "apps/api/src/auth/auth.types.ts",
      "apps/api/src/auth/controllers/credentials.controller.ts",
      "apps/api/src/auth/controllers/oauth.controller.ts",
      "apps/api/src/auth/credential.mapper.ts",
      "apps/api/src/auth/credential.select.ts",
      "apps/api/src/auth/repo/credential.repo.ts",
      "apps/api/src/auth/sentry-auth.ts",
      "apps/api/src/auth/sentry-event.mapper.ts",
      "apps/api/src/auth/sentry-key.guard.ts",
      "apps/api/src/auth/services/credential.service.ts",
      "apps/api/src/auth/services/oauth-token.service.ts",
      "apps/api/src/auth/services/sentry-ingest.service.ts",
      "apps/api/src/config/boot.config.ts",
      "apps/api/src/config/config.controller.ts",
      "apps/api/src/config/config.module.ts",
      "apps/api/src/internal/internal-config.controller.ts",
      "apps/api/src/internal/internal.guard.ts",
      "apps/api/test/config-secret.e2e.test.ts",
      "apps/api/test/credentials.e2e.test.ts",
      "packages/agents/src/config.ts",
      "packages/config/src/load.ts",
      "packages/config/src/schema.ts",
      "packages/gateway/src/config.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/auth/controllers/credentials.controller.ts",
          "apps/api/src/auth/controllers/oauth.controller.ts",
          "apps/api/src/auth/services/credential.service.ts",
          "apps/api/src/auth/services/oauth-token.service.ts",
          "apps/api/src/auth/auth.schema.ts",
          "apps/api/src/auth/auth.types.ts"
        ],
        "invariant": "Reusable secrets are returned only to the authenticated issuer or successfully authenticated OAuth client and do not appear in later metadata responses.",
        "method": "source",
        "result": "The credential controller applies the management OAuth guard to issue/list/revoke. CredentialService returns value only from issue after the repository write completes; list uses the explicit metadata projection. The OAuth endpoint returns an access token only after the stored client's secret has been verified. Response types and schemas distinguish issuance value from later metadata. Conflict errors use fixed messages and do not interpolate a token, hash or client secret. The intended one-time return is not treated as unauthorized disclosure.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/auth/services/credential.service.ts",
          "apps/api/src/auth/repo/credential.repo.ts",
          "apps/api/src/auth/credential.mapper.ts",
          "apps/api/src/auth/credential.select.ts",
          "apps/api/src/app.factory.ts",
          "apps/api/test/credentials.e2e.test.ts"
        ],
        "invariant": "Credential metadata, audit copies and normal application logging do not become alternate readers of raw Credential values or stored hashes.",
        "method": "source",
        "result": "The active service metadata projection and the sibling credential.mapper/select projections omit hash and value. Production credential audit payloads contain ids, names, kinds, scopes, service and expiry only; the raw value never reaches the repository. The inspected issuance and verification paths do not log submitted or generated secrets, and createApp disables the Nest logger at app.factory.ts:51. credentials.e2e.test.ts:41-62 specifies the no-value/no-hash listing response. This is source evidence only; external proxy logs and cache behavior were not inferred.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/config/config.controller.ts",
          "apps/api/src/config/config.module.ts",
          "apps/api/src/config/boot.config.ts",
          "apps/api/src/internal/internal-config.controller.ts",
          "apps/api/src/internal/internal.guard.ts",
          "packages/config/src/load.ts",
          "packages/config/src/schema.ts",
          "packages/agents/src/config.ts",
          "packages/gateway/src/config.ts",
          "apps/api/test/config-secret.e2e.test.ts"
        ],
        "invariant": "Public config export and the separate internal config projection must not resolve environment-held provider keys, JWT keys, internal tokens, root passwords or database credentials into responses.",
        "method": "source",
        "result": "The public controller injects GRAVESHIFT_CONFIG, the validated YAML object, rather than RootBootConfig. The exported Agent and GitHub credential fields are constrained environment-variable names; this path does not resolve them. Agent baseUrl validation explicitly rejects HTTP and URL userinfo at packages/agents/src/config.ts:71-74. The internal controller requires InternalGuard and explicitly returns granted Project ids, Agents, policy, gateway budgets, stream name and mode, omitting RootBootConfig's database URL, root password, internal tokens, auth config and service URLs. GatewayConfigSchema has only budget/retry/timeout/price fields. Reviewed secret-hygiene test source covers unknown Agent-key rejection and policy-key stripping; it was not executed.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/auth/sentry-auth.ts",
          "apps/api/src/auth/sentry-key.guard.ts",
          "apps/api/src/auth/sentry-event.mapper.ts",
          "apps/api/src/auth/services/sentry-ingest.service.ts"
        ],
        "invariant": "Sentry-compatible credential carriers do not broaden the key's authority or copy envelope authentication material into returned or published event metadata.",
        "method": "source",
        "result": "The adapter intentionally accepts the plugin value from sentry_key, a Sentry authorization value, or DSN userinfo, rejects conflicting values, and requires a service-bound plugin Credential with only events:publish and an exact route Project match. mapSentryEvent uses the authenticated Project/service and selects event exception, message and request fields for the payload; it does not copy envelope dsn or the verified Credential. SentryIngestService applies string and sensitive-field redaction and returns only an event id. Query-based SDK compatibility is source-visible, but no application logging or response path exposing that key to an unauthorized reader was established; no transport vulnerability is inferred from an unobserved ingress configuration.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "credentials",
    "priority": 2,
    "priority_reason": "Credentials and config export protect high-value authority and secrets; grant narrowing and revocation need explicit review.",
    "hardening_notes": [
      "Consider declaring Cache-Control: no-store directly on successful OAuth-token and Credential-issuance responses in apps/api/src/auth/controllers/oauth.controller.ts and credentials.controller.ts. These controllers and configureApp do not set an explicit no-store policy. No unauthorized cache reader or deployed cache behavior was demonstrated, so this is a hardening note rather than a candidate.",
      "Before adding OAuth-client deletion or grant-downgrade APIs, define whether they cascade to previously issued Credentials. CredentialService.verify currently checks the independent Credential record, and the Credential model has no parent-client foreign key; current public identity routes expose neither transition. If cascading revocation becomes a product guarantee, enforce it at the shared verifier or in the same transaction as the parent change and add a dummy-client regression case. No current cascading guarantee or source-visible violating API transition was established."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fcredentials.controller.ts%23CredentialsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fcredential.service.ts%23CredentialService::apps%2Fapi%2Fsrc%2Fauth::WEB-PROTOCOL-AND-AUTH.md%23API-key%20scope%20and%20resource%20binding",
    "canonical_refs": {
      "surface": "apps/api/src/auth/controllers/credentials.controller.ts#CredentialsController",
      "boundary": "apps/api/src/auth/services/credential.service.ts#CredentialService",
      "subsystem": "apps/api/src/auth",
      "attack_class": "WEB-PROTOCOL-AND-AUTH.md#API-key scope and resource binding"
    },
    "surface": "OAuth exchange, Credential issue/list/revoke, and config export",
    "boundary": "OAuth and Credential holders to bound Project scopes and secret config",
    "subsystem": "apps/api/src/auth",
    "attack_class": "Credential scope and resource binding",
    "starting_paths": [
      "apps/api/src/auth",
      "apps/api/src/config",
      "apps/api/src/internal/internal-config.controller.ts",
      "apps/api/test/credentials.e2e.test.ts",
      "apps/api/test/config-guard.e2e.test.ts",
      "apps/api/test/config-secret.e2e.test.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "WEB-PROTOCOL-AND-AUTH.md#Core discipline",
      "WEB-PROTOCOL-AND-AUTH.md#API-key scope and resource binding",
      "WEB-PROTOCOL-AND-AUTH.md#Universal moves",
      "WEB-PROTOCOL-AND-AUTH.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Cryptography and secrets",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/auth; this unit covers Credential scope and resource binding."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-credentials",
    "reviewed_paths": [
      "apps/api/prisma/schema.prisma",
      "apps/api/src/app.factory.ts",
      "apps/api/src/auth/auth.module.ts",
      "apps/api/src/auth/controllers/credentials.controller.ts",
      "apps/api/src/auth/credential-core.module.ts",
      "apps/api/src/auth/dto/create-credential.dto.ts",
      "apps/api/src/auth/dto/credential-params.dto.ts",
      "apps/api/src/auth/dto/no-mcp-service.constraint.ts",
      "apps/api/src/auth/oauth-client-credentials.strategy.ts",
      "apps/api/src/auth/oauth-principal.ts",
      "apps/api/src/auth/plugin-api-key.guard.ts",
      "apps/api/src/auth/repo/credential.repo.ts",
      "apps/api/src/auth/scopes.ts",
      "apps/api/src/auth/sentry-key.guard.ts",
      "apps/api/src/auth/services/credential.service.spec.ts",
      "apps/api/src/auth/services/credential.service.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/mcp/mcp-token.verifier.ts",
      "apps/api/test/credentials.e2e.test.ts",
      "apps/api/test/oauth.e2e.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/app.factory.ts",
          "apps/api/src/auth/auth.module.ts",
          "apps/api/src/auth/controllers/credentials.controller.ts",
          "apps/api/src/auth/dto/create-credential.dto.ts",
          "apps/api/src/auth/dto/credential-params.dto.ts",
          "apps/api/src/auth/dto/no-mcp-service.constraint.ts",
          "apps/api/src/auth/oauth-client-credentials.strategy.ts",
          "apps/api/src/auth/oauth-principal.ts"
        ],
        "invariant": "A caller cannot use JWT claims, undeclared request fields, or a malformed create request to choose another issuing Project or gain management authority.",
        "method": "source",
        "result": "The production module registers the OAuth strategy used by every credential route. Passport is configured for HS256 with explicit issuer/audience; verifyOAuthPrincipal additionally requires expiry, numeric Project, a current registered client with that same Project, and a token scope subset of its current grant. The strategy separately requires tokens:manage. configureApp enables whitelist and forbidNonWhitelisted on real class DTOs. CreateCredentialDto has no projectId or clientId field, restricts kind/scopes, and rejects a service binding on MCP. CredentialParamsDto bounds and validates the record selector. Thus a request body cannot override the authenticated principal used by issue/list/revoke.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/auth/services/credential.service.ts",
          "apps/api/src/auth/scopes.ts",
          "apps/api/src/auth/repo/credential.repo.ts",
          "apps/api/prisma/schema.prisma",
          "apps/api/src/auth/credential-core.module.ts"
        ],
        "invariant": "Credential authority is the intersection of its kind's catalog and the issuing principal's grant, while list/revoke remain bound to both owning client and Project.",
        "method": "source",
        "result": "issue rechecks nonempty scopes, exact per-kind allowed scopes, forbidden scopes and the principal's holdings before storage at credential.service.ts:44-57. Neither config:export, fix:trigger nor tokens:manage belongs to a Credential kind. It sets projectId and clientId exclusively from the principal at lines 80-82. The shared verifier returns the stored bindings and rejects a different expected kind. Repository list, initial revoke lookup and conditional revoke update each constrain clientId and projectId. The owner-scoped advisory lock and active-count transaction cap parallel issuance without widening ownership. Full-hash lookup authenticates a bearer identity; no request resource selector participates in that lookup or replaces its stored bindings.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/auth/plugin-api-key.guard.ts",
          "apps/api/src/auth/sentry-key.guard.ts",
          "apps/api/src/auth/services/event-ingest.service.ts",
          "apps/api/src/mcp/mcp-token.verifier.ts"
        ],
        "invariant": "The first consumers of a verified Credential preserve kind, Project, service and action scope rather than allowing a request selector to replace them.",
        "method": "source",
        "result": "PluginApiKeyGuard requires plugin kind and events:publish even for a principal obtained by the throttler. EventIngestService checks exact body/project equality and any stored service binding before publication. SentryKeyGuard independently requires plugin kind, exact path/project equality, a nonempty service binding and a single events:publish scope. The MCP verifier and bearer guard require mcp kind and carry the stored Project and scopes into request context. These handoff checks establish the assigned Credential binding invariant; peer-owned downstream event and MCP data operations were not separately hunted.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/test/credentials.e2e.test.ts",
          "apps/api/test/oauth.e2e.test.ts",
          "apps/api/src/auth/services/credential.service.spec.ts"
        ],
        "invariant": "Negative cases cover cross-client/cross-Project selectors, forbidden or unheld scopes, wrong surfaces and forged OAuth claims.",
        "method": "source",
        "result": "Reviewed test source specifies rejection of request-supplied projectId, cross-kind scopes, unheld scopes, MCP service bindings, foreign listings and foreign revocation. OAuth tests specify wrong signature/audience/issuer, missing or expired exp, unregistered clients and forged Project/scope claims. Service tests separately reject fix:trigger for both Credential kinds, including when the issuing principal holds it. These were source checks only. No accepted out-of-scope Credential transition was established.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "credentials",
    "priority": 2,
    "priority_reason": "Credentials and config export protect high-value authority and secrets; grant narrowing and revocation need explicit review.",
    "hardening_notes": [
      "Consider declaring Cache-Control: no-store directly on successful OAuth-token and Credential-issuance responses in apps/api/src/auth/controllers/oauth.controller.ts and credentials.controller.ts. These controllers and configureApp do not set an explicit no-store policy. No unauthorized cache reader or deployed cache behavior was demonstrated, so this is a hardening note rather than a candidate.",
      "Before adding OAuth-client deletion or grant-downgrade APIs, define whether they cascade to previously issued Credentials. CredentialService.verify currently checks the independent Credential record, and the Credential model has no parent-client foreign key; current public identity routes expose neither transition. If cascading revocation becomes a product guarantee, enforce it at the shared verifier or in the same transaction as the parent change and add a dummy-client regression case. No current cascading guarantee or source-visible violating API transition was established."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fevents.controller.ts%23EventsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fevent-ingest.service.ts%23EventIngestService::apps%2Fapi%2Fsrc%2Fauth%2Fservices::ATTACK-CLASSES.md%23Access%20control",
    "canonical_refs": {
      "surface": "apps/api/src/auth/controllers/events.controller.ts#EventsController",
      "boundary": "apps/api/src/auth/services/event-ingest.service.ts#EventIngestService",
      "subsystem": "apps/api/src/auth/services",
      "attack_class": "ATTACK-CLASSES.md#Access control"
    },
    "surface": "Plugin Event and Sentry envelope ingestion",
    "boundary": "Plugin publish keys and telemetry producers to Project data, deployment facts, and broker messages",
    "subsystem": "apps/api/src/auth/services",
    "attack_class": "Plugin Project and service binding",
    "starting_paths": [
      "apps/api/src/auth/controllers/events.controller.ts",
      "apps/api/src/auth/controllers/sentry-events.controller.ts",
      "apps/api/src/auth/plugin-api-key.guard.ts",
      "apps/api/src/auth/sentry-key.guard.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/auth/services/sentry-ingest.service.ts",
      "apps/api/src/auth/sentry-auth.ts",
      "apps/api/src/auth/sentry-envelope.parser.ts",
      "apps/api/src/auth/sentry-event.mapper.ts",
      "packages/core/src/envelope.ts",
      "packages/core/src/privacy.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/auth/services; this unit covers Plugin Project and service binding."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-ingest",
    "reviewed_paths": [
      "apps/api/src/auth/controllers/events.controller.ts",
      "apps/api/src/auth/controllers/sentry-events.controller.ts",
      "apps/api/src/auth/auth.module.ts",
      "apps/api/src/auth/plugin-api-key.guard.ts",
      "apps/api/src/auth/sentry-key.guard.ts",
      "apps/api/src/auth/credential-core.module.ts",
      "apps/api/src/auth/services/credential.service.ts",
      "apps/api/src/auth/repo/credential.repo.ts",
      "apps/api/src/auth/throttle-key.generator.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/auth/services/sentry-ingest.service.ts",
      "apps/api/src/auth/sentry-event.mapper.ts",
      "apps/api/src/deploys/deploy.repo.ts",
      "apps/api/test/events.e2e.test.ts",
      "apps/api/test/sentry-events.e2e.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-ingest",
        "reviewed_paths": [
          "apps/api/src/auth/controllers/events.controller.ts",
          "apps/api/src/auth/controllers/sentry-events.controller.ts",
          "apps/api/src/auth/auth.module.ts",
          "apps/api/src/auth/plugin-api-key.guard.ts",
          "apps/api/src/auth/sentry-key.guard.ts",
          "apps/api/src/auth/credential-core.module.ts",
          "apps/api/src/auth/services/credential.service.ts",
          "apps/api/src/auth/repo/credential.repo.ts",
          "apps/api/src/auth/throttle-key.generator.ts"
        ],
        "invariant": "Both ingestion routes require a current plugin Credential with events:publish; an MCP token, OAuth token, revoked Credential, or throttler identity cannot replace that authority.",
        "method": "source",
        "result": "Both controllers install their authentication guards. CredentialService.verify reads the record by token hash, checks revocation and expiry, and checks the requested kind. The Sentry verifier token resolves to that same service. PluginApiKeyGuard checks events:publish and accepts the throttler's credentialPrincipal only after track verified the same nonempty Bearer value; management JWT tracking does not populate that field. SentryKeyGuard independently verifies the key and requires exactly the publish scope. No weaker alternative ingestion controller was registered in the reviewed path.",
        "artifact": null
      },
      {
        "agent_id": "hunt-ingest",
        "reviewed_paths": [
          "apps/api/src/auth/services/event-ingest.service.ts",
          "apps/api/src/auth/services/sentry-ingest.service.ts",
          "apps/api/src/auth/sentry-event.mapper.ts",
          "apps/api/src/deploys/deploy.repo.ts",
          "apps/api/test/events.e2e.test.ts",
          "apps/api/test/sentry-events.e2e.test.ts"
        ],
        "invariant": "Request fields cannot publish into another Project or another service outside the Credential's binding, including when resolving a Deployment.",
        "method": "source",
        "result": "EventIngestService:30-45 compares body.projectId and any non-null service binding before a Deployment lookup or publish. DeployRepo.findByDeployment queries the authenticated Project, SHA, and Environment together. SentryIngestService repeats the Project/service check, and mapSentryEvent:93-103 assigns Project and service from the verified Credential rather than event fields. Unbound plugin Credentials intentionally cover all services in their own Project, as the HTTP test source explicitly specifies. The test sources also specify wrong-Project, wrong-service, expired/revoked-key, and forged Sentry body rejection or isolation; those tests were read, not executed.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "ingest",
    "priority": 3,
    "priority_reason": "Lower-trust telemetry is externally ingested and later influences triage and privileged fixes.",
    "hardening_notes": [
      "SentryIngestService currently relies on the production Publisher implementation for the full prepareEnvelope privacy contract. Calling the canonical preparation seam explicitly in the service, or expressing that guarantee in the Publisher interface contract, would make this dependency easier to maintain. The current AuthModule -> NATS publisher chain already enforces it, so the narrower local Sentry sensitive-key regex is not reported as a disclosure vulnerability."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fevents.controller.ts%23EventsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fevent-ingest.service.ts%23EventIngestService::apps%2Fapi%2Fsrc%2Fauth%2Fservices::DATA-ISOLATION-AND-LIFECYCLE.md%23Analytics%2C%20logs%2C%20traces%2C%20and%20diagnostics%20as%20alternate%20readers",
    "canonical_refs": {
      "surface": "apps/api/src/auth/controllers/events.controller.ts#EventsController",
      "boundary": "apps/api/src/auth/services/event-ingest.service.ts#EventIngestService",
      "subsystem": "apps/api/src/auth/services",
      "attack_class": "DATA-ISOLATION-AND-LIFECYCLE.md#Analytics, logs, traces, and diagnostics as alternate readers"
    },
    "surface": "Plugin Event and Sentry envelope ingestion",
    "boundary": "Plugin publish keys and telemetry producers to Project data, deployment facts, and broker messages",
    "subsystem": "apps/api/src/auth/services",
    "attack_class": "Ingest disclosure into derived telemetry",
    "starting_paths": [
      "apps/api/src/auth/controllers/events.controller.ts",
      "apps/api/src/auth/controllers/sentry-events.controller.ts",
      "apps/api/src/auth/plugin-api-key.guard.ts",
      "apps/api/src/auth/sentry-key.guard.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/auth/services/sentry-ingest.service.ts",
      "apps/api/src/auth/sentry-auth.ts",
      "apps/api/src/auth/sentry-envelope.parser.ts",
      "apps/api/src/auth/sentry-event.mapper.ts",
      "packages/core/src/envelope.ts",
      "packages/core/src/privacy.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
    "selected_companion_blocks": [
      "DATA-ISOLATION-AND-LIFECYCLE.md#Core discipline",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Analytics, logs, traces, and diagnostics as alternate readers",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Universal moves",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/auth/services; this unit covers Ingest disclosure into derived telemetry."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-ingest",
    "reviewed_paths": [
      "docs/adr/0019-event-identity-and-privacy.md",
      "packages/core/src/envelope.ts",
      "packages/core/src/privacy.ts",
      "packages/core/src/schemas.ts",
      "packages/redactor/src/index.ts",
      "packages/redactor/src/detectors.ts",
      "apps/api/src/auth/services/sentry-ingest.service.ts",
      "apps/api/src/auth/sentry-event.mapper.ts",
      "apps/api/src/auth/auth.module.ts",
      "apps/api/src/auth/services/nats-event-publisher.ts",
      "packages/events/src/nats.ts",
      "packages/events/src/publisher.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/audit/audit.mapper.ts",
      "apps/api/src/audit/audit.repo.ts",
      "apps/api/src/mcp/events/events.types.ts",
      "apps/api/src/mcp/events/events.service.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-ingest",
        "reviewed_paths": [
          "docs/adr/0019-event-identity-and-privacy.md",
          "packages/core/src/envelope.ts",
          "packages/core/src/privacy.ts",
          "packages/core/src/schemas.ts",
          "packages/redactor/src/index.ts",
          "packages/redactor/src/detectors.ts",
          "apps/api/src/auth/services/sentry-ingest.service.ts",
          "apps/api/src/auth/sentry-event.mapper.ts",
          "apps/api/src/auth/auth.module.ts",
          "apps/api/src/auth/services/nats-event-publisher.ts",
          "packages/events/src/nats.ts",
          "packages/events/src/publisher.ts"
        ],
        "invariant": "Recognized credentials and sensitive payload keys must pass the documented privacy checks before either HTTP ingestion format reaches the broker, while approved nonsecret identity stays stable.",
        "method": "source",
        "result": "ADR 0019 distinguishes approved nonsecret identifiers from free text. prepareEnvelope rejects recognized sensitive identity metadata, recursively redacts string values, drops sensitive or redacted object keys, rejects non-JSON values/accessors/cycles, and validates the final envelope. Sentry's own redaction has a narrower sensitive-key expression, but the production binding is AuthModule -> NatsEventPublisher -> connectNatsPublisher -> createNatsPublisher, whose publish method calls prepareEnvelope again before serialization. Thus the apparent Sentry sensitive-key gap is prevented by a source-visible downstream layer. The DSN and its key are used for authentication and are not copied into the mapped payload. No source-grounded unauthorized disclosure survived this trace.",
        "artifact": null
      },
      {
        "agent_id": "hunt-ingest",
        "reviewed_paths": [
          "apps/api/src/auth/services/event-ingest.service.ts",
          "apps/api/src/audit/audit.mapper.ts",
          "apps/api/src/audit/audit.repo.ts",
          "apps/api/src/mcp/events/events.types.ts",
          "apps/api/src/mcp/events/events.service.ts"
        ],
        "invariant": "The unassigned-event audit copy and Event Occurrences must not restore raw credential-bearing payloads or move the ingested record into another Project.",
        "method": "source",
        "result": "The unassigned audit record contains the already-validated event id, Project, optional SHA, and explicitly redacted Environment, rather than the request payload or authentication material. AuditRepo stores and queries that copy under projectId, with Project-scoped event-key deduplication. Event descriptors call prepareEnvelope before projecting declared occurrence fields; EventPollService applies the descriptor's read scope and filters the bound Project before projection. Its identity exemptions therefore receive the prepared identity contract, while other text is redacted again. No raw-ingest diagnostic logger or alternate unsanitized payload write appears in these paths. External analytics/storage access policies were not assumed or probed.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "ingest",
    "priority": 3,
    "priority_reason": "Lower-trust telemetry is externally ingested and later influences triage and privileged fixes.",
    "hardening_notes": [
      "SentryIngestService currently relies on the production Publisher implementation for the full prepareEnvelope privacy contract. Calling the canonical preparation seam explicitly in the service, or expressing that guarantee in the Publisher interface contract, would make this dependency easier to maintain. The current AuthModule -> NATS publisher chain already enforces it, so the narrower local Sentry sensitive-key regex is not reported as a disclosure vulnerability."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fevents.controller.ts%23EventsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fevent-ingest.service.ts%23EventIngestService::apps%2Fapi%2Fsrc%2Fauth%2Fservices::PROTOCOLS-RPC-AND-MESSAGING.md%23Untrusted%20producer%20treated%20as%20control%20plane",
    "canonical_refs": {
      "surface": "apps/api/src/auth/controllers/events.controller.ts#EventsController",
      "boundary": "apps/api/src/auth/services/event-ingest.service.ts#EventIngestService",
      "subsystem": "apps/api/src/auth/services",
      "attack_class": "PROTOCOLS-RPC-AND-MESSAGING.md#Untrusted producer treated as control plane"
    },
    "surface": "Plugin Event and Sentry envelope ingestion",
    "boundary": "Plugin publish keys and telemetry producers to Project data, deployment facts, and broker messages",
    "subsystem": "apps/api/src/auth/services",
    "attack_class": "Telemetry to deployment and privileged-state trust",
    "starting_paths": [
      "apps/api/src/auth/controllers/events.controller.ts",
      "apps/api/src/auth/controllers/sentry-events.controller.ts",
      "apps/api/src/auth/plugin-api-key.guard.ts",
      "apps/api/src/auth/sentry-key.guard.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/auth/services/sentry-ingest.service.ts",
      "apps/api/src/auth/sentry-auth.ts",
      "apps/api/src/auth/sentry-envelope.parser.ts",
      "apps/api/src/auth/sentry-event.mapper.ts",
      "packages/core/src/envelope.ts",
      "packages/core/src/privacy.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
    "selected_companion_blocks": [
      "PROTOCOLS-RPC-AND-MESSAGING.md#Core discipline",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Untrusted producer treated as control plane",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Universal moves",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/auth/services; this unit covers Telemetry to deployment and privileged-state trust."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-ingest",
    "reviewed_paths": [
      "docs/adr/0027-deployment-is-the-triage-root.md",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/auth/sentry-event.mapper.ts",
      "apps/api/src/deploys/deploy.repo.ts",
      "packages/core/src/schemas.ts",
      "packages/events/src/consumer.ts",
      "packages/events/src/subject.ts",
      "packages/watcher/src/watcher.ts",
      "packages/watcher/src/rules.ts",
      "packages/core/src/rules.ts",
      "apps/daemon/src/observations.ts",
      "apps/api/src/hauntings/haunting.controller.ts",
      "apps/api/src/hauntings/haunting.service.ts",
      "apps/api/src/hauntings/haunting.repo.ts",
      "apps/api/src/internal/internal.guard.ts",
      "apps/api/src/internal/project-grant.ts",
      "apps/api/src/deploys/deployment-closure.ts",
      "apps/api/src/mcp/events/events.types.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-ingest",
        "reviewed_paths": [
          "docs/adr/0027-deployment-is-the-triage-root.md",
          "apps/api/src/auth/services/event-ingest.service.ts",
          "apps/api/src/auth/sentry-event.mapper.ts",
          "apps/api/src/deploys/deploy.repo.ts",
          "packages/core/src/schemas.ts"
        ],
        "invariant": "Telemetry can refer only to an existing Deployment in its authenticated Project and cannot create Deployment facts or make Sentry release/environment fields into a fix point.",
        "method": "source",
        "result": "EventIngestService overwrites deploymentId/environment with the result of DeployRepo.findByDeployment(Project, SHA, Environment), or nulls both when either input is absent or no match exists. It never calls append. Sentry mapping does not emit deploymentId or environment and ignores arbitrary release/deployment fields. This matches ADR 0027's explicit acceptance of unassigned Sentry/collector Events. The reviewed ingestion services provide no telemetry-to-Deployment-create command path.",
        "artifact": null
      },
      {
        "agent_id": "hunt-ingest",
        "reviewed_paths": [
          "packages/events/src/consumer.ts",
          "packages/events/src/subject.ts",
          "packages/watcher/src/watcher.ts",
          "packages/watcher/src/rules.ts",
          "packages/core/src/rules.ts",
          "apps/daemon/src/observations.ts",
          "apps/api/src/hauntings/haunting.controller.ts",
          "apps/api/src/hauntings/haunting.service.ts",
          "apps/api/src/hauntings/haunting.repo.ts",
          "apps/api/src/internal/internal.guard.ts",
          "apps/api/src/internal/project-grant.ts",
          "apps/api/src/deploys/deployment-closure.ts",
          "apps/api/src/mcp/events/events.types.ts"
        ],
        "invariant": "A caller-chosen source/type/payload is observation data; it must not become an independently authenticated control command or override Project authority at the next state-write boundary.",
        "method": "source",
        "result": "Consumer intake re-prepares the Event, checks exact subject/body equality, and checks the granted Project before handing it to observations. Watcher rules dispatch a fixed list of observation types; arbitrary audit.*, fix.*, deployment.*, or work.* names do not directly dispatch durable commands there. Observations derive the Project from the admitted Event and send derived Haunting writes through the separately authenticated internal API. HauntingService checks the stored Project grant, HauntingRepo rejects detections from another Project and writes by the composite Project/id key, and Deployment closure checks the opening SHA/Environment pair before a Project-scoped update. Event catalog prefixes can label untrusted notifications but do not supply durable audit or action approval authority. Telemetry's documented ability to cause a detection/diagnosis in its own scope was not treated as privilege gain. Peer-owned broker deduplication and later fix-execution internals were not investigated further.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "ingest",
    "priority": 3,
    "priority_reason": "Lower-trust telemetry is externally ingested and later influences triage and privileged fixes.",
    "hardening_notes": [
      "SentryIngestService currently relies on the production Publisher implementation for the full prepareEnvelope privacy contract. Calling the canonical preparation seam explicitly in the service, or expressing that guarantee in the Publisher interface contract, would make this dependency easier to maintain. The current AuthModule -> NATS publisher chain already enforces it, so the narrower local Sentry sensitive-key regex is not reported as a disclosure vulnerability."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fevents.controller.ts%23EventsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fevent-ingest.service.ts%23EventIngestService::apps%2Fapi%2Fsrc%2Fauth%2Fservices::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Decompression%20and%20representation%20amplification",
    "canonical_refs": {
      "surface": "apps/api/src/auth/controllers/events.controller.ts#EventsController",
      "boundary": "apps/api/src/auth/services/event-ingest.service.ts#EventIngestService",
      "subsystem": "apps/api/src/auth/services",
      "attack_class": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Decompression and representation amplification"
    },
    "surface": "Plugin Event and Sentry envelope ingestion",
    "boundary": "Plugin publish keys and telemetry producers to Project data, deployment facts, and broker messages",
    "subsystem": "apps/api/src/auth/services",
    "attack_class": "Ingest parser and representation bounds",
    "starting_paths": [
      "apps/api/src/auth/controllers/events.controller.ts",
      "apps/api/src/auth/controllers/sentry-events.controller.ts",
      "apps/api/src/auth/plugin-api-key.guard.ts",
      "apps/api/src/auth/sentry-key.guard.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/auth/services/sentry-ingest.service.ts",
      "apps/api/src/auth/sentry-auth.ts",
      "apps/api/src/auth/sentry-envelope.parser.ts",
      "apps/api/src/auth/sentry-event.mapper.ts",
      "packages/core/src/envelope.ts",
      "packages/core/src/privacy.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Resource and file handling",
    "selected_companion_blocks": [
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Core discipline",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Decompression and representation amplification",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Universal moves",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/auth/services; this unit covers Ingest parser and representation bounds."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-ingest",
    "reviewed_paths": [
      "apps/api/src/app.factory.ts",
      "apps/api/src/app.module.ts",
      "apps/api/src/auth/controllers/events.controller.ts",
      "apps/api/src/auth/controllers/sentry-events.controller.ts",
      "apps/api/src/auth/payload-size.interceptor.ts",
      "apps/api/src/auth/auth.config.module.ts",
      "apps/api/src/auth/env.schema.ts",
      "apps/api/src/auth/sentry-envelope.parser.ts",
      "apps/api/src/auth/services/sentry-ingest.service.ts",
      "packages/core/src/envelope.ts",
      "packages/events/src/streams.ts",
      "packages/events/src/consumer.ts",
      "apps/api/src/auth/sentry-event.mapper.ts",
      "packages/redactor/src/index.ts",
      "packages/redactor/src/detectors.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "packages/core/src/privacy.ts",
      "apps/api/src/main.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-ingest",
        "reviewed_paths": [
          "apps/api/src/app.factory.ts",
          "apps/api/src/app.module.ts",
          "apps/api/src/auth/controllers/events.controller.ts",
          "apps/api/src/auth/controllers/sentry-events.controller.ts",
          "apps/api/src/auth/payload-size.interceptor.ts",
          "apps/api/src/auth/auth.config.module.ts",
          "apps/api/src/auth/env.schema.ts",
          "apps/api/src/auth/sentry-envelope.parser.ts",
          "apps/api/src/auth/services/sentry-ingest.service.ts",
          "packages/core/src/envelope.ts",
          "packages/events/src/streams.ts",
          "packages/events/src/consumer.ts"
        ],
        "invariant": "Byte counts, parser progress, recursive conversion, and downstream representation limits must prevent unbounded expansion from one accepted ingestion request.",
        "method": "source",
        "result": "Sentry raw parsing is configured with a one-MiB limit; parseSentryEnvelope independently caps the whole envelope and event item at 1,048,576 bytes. Item lengths must be nonnegative safe integers, stay within the body, and end at a newline or EOF; each loop advances the byte cursor, unknown item payloads are skipped, and multiple event items are rejected. There is no archive extraction, attachment decoding, or secondary fetch in this parser. Sentry redaction truncates nested containers at depth 64. Core JSON cleaning rejects cycles and unsupported object representations and converts failures to EnvelopeError. Plugin input has a configurable 65,536-byte default and 102,400-byte maximum before its DTO/service processing. Both controllers apply throttling, with a default of 60 requests per client per minute. The stream declares a 128-KiB message limit, and consumer decoding independently rejects larger messages. These controls settle the direct framing/representation-expansion paths; they do not establish a per-string CPU bound for the separate candidate below.",
        "artifact": null
      },
      {
        "agent_id": "hunt-ingest",
        "reviewed_paths": [
          "apps/api/src/auth/sentry-event.mapper.ts",
          "packages/redactor/src/index.ts",
          "packages/redactor/src/detectors.ts",
          "apps/api/src/auth/services/event-ingest.service.ts",
          "packages/core/src/privacy.ts",
          "apps/api/src/main.ts"
        ],
        "invariant": "An accepted bounded telemetry string must not impose disproportionate synchronous regex work on the API process shared with other Projects.",
        "method": "source",
        "result": "mapSentryEvent's eventType calls redact on the complete raw event.type or exception type before slicing the result to 128 characters. redact synchronously runs the email pattern /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/g, whose unanchored greedy local-part scan can retry across a long non-matching token. An event.type consisting of a long ASCII alphabetic token can fit below the Sentry byte caps yet map to a small final Event, so the downstream broker message cap does not prevent this work. Plugin payload strings reach the same detector through prepareEnvelope under the smaller plugin cap; metadata also reaches it through hasSensitiveText. No worker handoff or per-call CPU deadline appears on these paths. Actual Bun regex behavior and meaningful delay to unrelated work were not observed because execution is prohibited without complete memory and cumulative-disk sandbox controls.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "packages/redactor/src/detectors.ts:email-unanchored-scan"
    ],
    "unresolved": [
      "The supported Bun regex engine's optimization or fallback behavior and the resulting cost at accepted input sizes need a bounded local check; source review alone does not demonstrate shared API availability impact.",
      "Target-controlled execution is prohibited because complete OS-enforced memory and cumulative-disk sandbox controls are not established. No local execution or artifact promotion was performed."
    ],
    "assignment_group": "ingest",
    "priority": 3,
    "priority_reason": "Lower-trust telemetry is externally ingested and later influences triage and privileged fixes.",
    "hardening_notes": [
      "SentryIngestService currently relies on the production Publisher implementation for the full prepareEnvelope privacy contract. Calling the canonical preparation seam explicitly in the service, or expressing that guarantee in the Publisher interface contract, would make this dependency easier to maintain. The current AuthModule -> NATS publisher chain already enforces it, so the narrower local Sentry sensitive-key regex is not reported as a disclosure vulnerability."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fsentry-events.controller.ts%23SentryEventsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fevent-ingest.service.ts%23EventIngestService::apps%2Fapi%2Fsrc%2Fauth%2Fservices::PROTOCOLS-RPC-AND-MESSAGING.md%23Envelope%20and%20payload%20identity%20mismatch",
    "canonical_refs": {
      "surface": "apps/api/src/auth/controllers/sentry-events.controller.ts#SentryEventsController",
      "boundary": "apps/api/src/auth/services/event-ingest.service.ts#EventIngestService",
      "subsystem": "apps/api/src/auth/services",
      "attack_class": "PROTOCOLS-RPC-AND-MESSAGING.md#Envelope and payload identity mismatch"
    },
    "surface": "Plugin Event and Sentry envelope ingestion",
    "boundary": "Plugin publish keys and telemetry producers to Project data, deployment facts, and broker messages",
    "subsystem": "apps/api/src/auth/services",
    "attack_class": "Sentry identity and parser interpretation",
    "starting_paths": [
      "apps/api/src/auth/controllers/events.controller.ts",
      "apps/api/src/auth/controllers/sentry-events.controller.ts",
      "apps/api/src/auth/plugin-api-key.guard.ts",
      "apps/api/src/auth/sentry-key.guard.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/auth/services/sentry-ingest.service.ts",
      "apps/api/src/auth/sentry-auth.ts",
      "apps/api/src/auth/sentry-envelope.parser.ts",
      "apps/api/src/auth/sentry-event.mapper.ts",
      "packages/core/src/envelope.ts",
      "packages/core/src/privacy.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Injection",
    "selected_companion_blocks": [
      "PROTOCOLS-RPC-AND-MESSAGING.md#Core discipline",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Envelope and payload identity mismatch",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Universal moves",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/auth/services; this unit covers Sentry identity and parser interpretation."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-ingest",
    "reviewed_paths": [
      "apps/api/src/auth/sentry-auth.ts",
      "apps/api/src/auth/sentry-key.guard.ts",
      "apps/api/src/auth/sentry-envelope.parser.ts",
      "apps/api/src/auth/sentry-event.mapper.ts",
      "apps/api/src/auth/services/sentry-ingest.service.ts",
      "apps/api/src/auth/dto/sentry-params.dto.ts",
      "apps/api/src/app.factory.ts",
      "apps/api/src/auth/dto/publish-event.dto.ts",
      "packages/core/src/schemas.ts",
      "packages/events/src/subject.ts",
      "packages/events/src/consumer.ts",
      "apps/api/src/auth/sentry-envelope.parser.spec.ts",
      "apps/api/src/auth/sentry-event.mapper.spec.ts",
      "apps/api/test/sentry-events.e2e.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-ingest",
        "reviewed_paths": [
          "apps/api/src/auth/sentry-auth.ts",
          "apps/api/src/auth/sentry-key.guard.ts",
          "apps/api/src/auth/sentry-envelope.parser.ts",
          "apps/api/src/auth/sentry-event.mapper.ts",
          "apps/api/src/auth/services/sentry-ingest.service.ts",
          "apps/api/src/auth/dto/sentry-params.dto.ts",
          "apps/api/src/app.factory.ts"
        ],
        "invariant": "The authenticated key, Project, service, and selected event identity must have one authoritative interpretation from Sentry authentication through publication.",
        "method": "source",
        "result": "All collected query, Sentry Authorization, and envelope-DSN keys must match and have the 64-lowercase-hex form. The DSN parser only extracts the key; it performs no fetch. The numeric route Project must equal the stored Credential Project, and the mapped Project/service are taken only from that Credential. Authentication header reading and complete envelope parsing share the same jsonObject framing helper, so CRLF/padded headers are rejected consistently. A present envelope header event_id takes precedence over the body event_id; only an absent header id permits the body id or generated fallback. Invalid selected ids are rejected, the success response uses the published id, and skipped-only envelopes return a fresh random id. The header/body precedence does not create a second consumer acting on a different protected identity in the reviewed path.",
        "artifact": null
      },
      {
        "agent_id": "hunt-ingest",
        "reviewed_paths": [
          "apps/api/src/auth/dto/publish-event.dto.ts",
          "packages/core/src/schemas.ts",
          "packages/events/src/subject.ts",
          "packages/events/src/consumer.ts",
          "apps/api/src/auth/sentry-envelope.parser.spec.ts",
          "apps/api/src/auth/sentry-event.mapper.spec.ts",
          "apps/api/test/sentry-events.e2e.test.ts"
        ],
        "invariant": "Wire framing, type normalization, and subject construction must not let an item boundary or payload selector change the Project or service used by a downstream consumer.",
        "method": "source",
        "result": "Length-prefixed payloads use Buffer byte offsets rather than character lengths and require an exact terminating boundary. Non-event frames are skipped by that same framing logic, malformed event JSON is rejected, and more than one event frame is rejected. Plugin DTO/core schemas constrain Project and dotted type tokens, Sentry produces a normalized sentry.* type, and publishSubject validates tokens before constructing the subject. The consumer requires that subject to equal the subject reconstructed from the prepared body. Service-token normalization can collapse punctuation, but it does not mutate the bound service string in the Event body; no HTTP service-binding bypass was established from that representation alone. Parser, mapper, and HTTP regression sources were inspected without executing them. No concrete security-relevant parser disagreement survived the source trace.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "ingest",
    "priority": 3,
    "priority_reason": "Lower-trust telemetry is externally ingested and later influences triage and privileged fixes.",
    "hardening_notes": [
      "SentryIngestService currently relies on the production Publisher implementation for the full prepareEnvelope privacy contract. Calling the canonical preparation seam explicitly in the service, or expressing that guarantee in the Publisher interface contract, would make this dependency easier to maintain. The current AuthModule -> NATS publisher chain already enforces it, so the narrower local Sentry sensitive-key regex is not reported as a disclosure vulnerability."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fconfig%2Fconfig.controller.ts%23ConfigController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fcredential.service.ts%23CredentialService::apps%2Fapi%2Fsrc%2Fauth::DATA-ISOLATION-AND-LIFECYCLE.md%23Export%20and%20backup%20scope%20expansion",
    "canonical_refs": {
      "surface": "apps/api/src/config/config.controller.ts#ConfigController",
      "boundary": "apps/api/src/auth/services/credential.service.ts#CredentialService",
      "subsystem": "apps/api/src/auth",
      "attack_class": "DATA-ISOLATION-AND-LIFECYCLE.md#Export and backup scope expansion"
    },
    "surface": "OAuth exchange, Credential issue/list/revoke, and config export",
    "boundary": "OAuth and Credential holders to bound Project scopes and secret config",
    "subsystem": "apps/api/src/auth",
    "attack_class": "Config export scope and secret projection",
    "starting_paths": [
      "apps/api/src/auth",
      "apps/api/src/config",
      "apps/api/src/internal/internal-config.controller.ts",
      "apps/api/test/credentials.e2e.test.ts",
      "apps/api/test/config-guard.e2e.test.ts",
      "apps/api/test/config-secret.e2e.test.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
    "selected_companion_blocks": [
      "DATA-ISOLATION-AND-LIFECYCLE.md#Core discipline",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Export and backup scope expansion",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Universal moves",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/auth; this unit covers Config export scope and secret projection."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-credentials",
    "reviewed_paths": [
      "apps/api/src/app.module.ts",
      "apps/api/src/audit/audit.module.ts",
      "apps/api/src/audit/audit.repo.ts",
      "apps/api/src/audit/audit.transaction.ts",
      "apps/api/src/auth/oauth-client-access.strategy.ts",
      "apps/api/src/auth/oauth-principal.ts",
      "apps/api/src/auth/scopes.ts",
      "apps/api/src/auth/services/credential.service.ts",
      "apps/api/src/config/boot.config.ts",
      "apps/api/src/config/config.controller.ts",
      "apps/api/src/config/config.module.ts",
      "apps/api/src/config/config.provider.ts",
      "apps/api/src/identity/dto/identity.dto.ts",
      "apps/api/src/identity/services/identity.service.ts",
      "apps/api/src/internal/internal-config.controller.ts",
      "apps/api/src/internal/internal.guard.ts",
      "apps/api/test/config-guard.e2e.test.ts",
      "apps/api/test/config-secret.e2e.test.ts",
      "apps/api/test/config.e2e.test.ts",
      "docs/adr/0015-one-config-file-at-boot.md",
      "docs/adr/0023-organization-is-the-tenant-root.md",
      "graveshift.config.yaml",
      "packages/agents/src/config.ts",
      "packages/config/src/load.ts",
      "packages/config/src/schema.ts",
      "packages/gateway/src/config.ts",
      "packages/policy/src/schema.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/app.module.ts",
          "apps/api/src/config/config.controller.ts",
          "apps/api/src/auth/oauth-client-access.strategy.ts",
          "apps/api/src/auth/oauth-principal.ts",
          "apps/api/src/auth/scopes.ts",
          "apps/api/src/auth/services/credential.service.ts",
          "apps/api/src/identity/dto/identity.dto.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "docs/adr/0015-one-config-file-at-boot.md",
          "docs/adr/0023-organization-is-the-tenant-root.md"
        ],
        "invariant": "An ordinary Organization owner, member, MCP holder or plugin holder cannot turn its Project grant into deployment-wide config-export authority.",
        "method": "source",
        "result": "The registered ConfigController uses the OAuth access strategy, which performs current registry/project/scope validation and then demands exact config:export. This scope is deliberately HTTP-only and boot/operator-only: it is absent from CLIENT_ISSUABLE_SCOPES and every Credential kind. Public OAuth-client creation checks the catalog again inside IdentityService, so bypassing DTO validation does not grant config:export. CredentialService also rejects it for both kinds. ADR 0015:13 explicitly defines a full config export; returning the global object to an operator-granted exporter is therefore intended authority, rather than a demonstrated cross-Organization expansion. No route parameter chooses a broader artifact or alternate export.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/config/config.module.ts",
          "apps/api/src/config/config.provider.ts",
          "apps/api/src/config/boot.config.ts",
          "apps/api/src/internal/internal-config.controller.ts",
          "apps/api/src/internal/internal.guard.ts",
          "packages/config/src/load.ts",
          "packages/config/src/schema.ts",
          "packages/agents/src/config.ts",
          "packages/policy/src/schema.ts",
          "packages/gateway/src/config.ts",
          "graveshift.config.yaml"
        ],
        "invariant": "The exported snapshot is the validated non-secret config, and neither the public export nor the internal read accidentally spreads secret-bearing RootBootConfig fields.",
        "method": "source",
        "result": "loadGraveshiftConfig returns parsed schema data once at boot, and GraveshiftConfigModule deep-freezes that value. The strict merged schema contains only boot, Agents, policy and fix; Agent/GitHub credential fields name environment variables. Unknown Agent/fix/root keys fail validation, while unknown policy fields are stripped by its object schemas. No environment interpolation occurs on the public export path. The committed config's provider endpoints contain no embedded credentials and its secret fields are variable names. RootBootConfig separately contains deployment-local secrets; InternalConfigController requires the internal token and projects an explicit allowlist that excludes database URL, root identity/password, internal tokens and auth config. Thus the alternate internal reader does not expose those RootBootConfig secrets either.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/src/config/config.controller.ts",
          "apps/api/src/audit/audit.module.ts",
          "apps/api/src/audit/audit.repo.ts",
          "apps/api/src/audit/audit.transaction.ts"
        ],
        "invariant": "A config export cannot bypass its audit prerequisite or copy config contents into an audit chain with a wider reader set.",
        "method": "source",
        "result": "exportConfig awaits recordExport before returning the config at config.controller.ts:50-52. The draft contains only a random event key, the verified client's actor id, type config.exported and payload {exported: config}; actor.projectId selects the audit chain. AuditModule binds AUDIT_SINK to the PostgreSQL AuditRepo, whose append resolves through a serializable database transaction. Failures propagate before the return, and the payload never contains prompts, repository lists, secrets or the config snapshot. There is no queued export file or later download path in this controller.",
        "artifact": null
      },
      {
        "agent_id": "hunt-credentials",
        "reviewed_paths": [
          "apps/api/test/config-guard.e2e.test.ts",
          "apps/api/test/config-secret.e2e.test.ts",
          "apps/api/test/config.e2e.test.ts"
        ],
        "invariant": "Export denial, secret omission, failed audit, immutable boot snapshots and removed alternate routes preserve the same export policy.",
        "method": "source",
        "result": "Reviewed test source specifies anonymous and under-scoped denial, full validated export with unresolved environment names, identifier-only audit payloads, audit-failure denial, boot-snapshot stability and absence of write/removed per-block routes. Config guard tests reject config:export at both DTO and CredentialService boundaries. Secret tests cover unknown Agent keys, stripped policy secrets and invalid boot config. None of these tests or their fixture-processing helpers was executed. No source-grounded export-scope or secret-projection candidate survived.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "credentials",
    "priority": 2,
    "priority_reason": "Credentials and config export protect high-value authority and secrets; grant narrowing and revocation need explicit review.",
    "hardening_notes": [
      "Consider declaring Cache-Control: no-store directly on successful OAuth-token and Credential-issuance responses in apps/api/src/auth/controllers/oauth.controller.ts and credentials.controller.ts. These controllers and configureApp do not set an explicit no-store policy. No unauthorized cache reader or deployed cache behavior was demonstrated, so this is a hardening note rather than a candidate.",
      "Before adding OAuth-client deletion or grant-downgrade APIs, define whether they cascade to previously issued Credentials. CredentialService.verify currently checks the independent Credential record, and the Credential model has no parent-client foreign key; current public identity routes expose neither transition. If cascading revocation becomes a product guarantee, enforce it at the shared verifier or in the same transaction as the parent change and add a dummy-client regression case. No current cascading guarantee or source-visible violating API transition was established."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fidentity%2Fcontrollers%2Faccount.controller.ts%23AccountController::apps%2Fapi%2Fsrc%2Fidentity%2Fguards%2Faccount-auth.guard.ts%23AccountAuthGuard::apps%2Fapi%2Fsrc%2Fidentity::ATTACK-CLASSES.md%23Access%20control",
    "canonical_refs": {
      "surface": "apps/api/src/identity/controllers/account.controller.ts#AccountController",
      "boundary": "apps/api/src/identity/guards/account-auth.guard.ts#AccountAuthGuard",
      "subsystem": "apps/api/src/identity",
      "attack_class": "ATTACK-CLASSES.md#Access control"
    },
    "surface": "Account registration, login, Organization onboarding and OAuth client creation",
    "boundary": "Unauthenticated callers and Organization members to account sessions and owner authority",
    "subsystem": "apps/api/src/identity",
    "attack_class": "Account and Organization access control",
    "starting_paths": [
      "apps/api/src/identity",
      "apps/api/src/auth/oauth-principal.ts",
      "apps/api/src/auth/services/oauth-token.service.ts",
      "apps/api/test/identity-security.e2e.test.ts",
      "apps/api/test/identity.e2e.test.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/identity; this unit covers Account and Organization access control."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-identity",
    "reviewed_paths": [
      "apps/api/src/app.factory.ts",
      "apps/api/src/identity/controllers/account.controller.ts",
      "apps/api/src/identity/controllers/organizations.controller.ts",
      "apps/api/src/identity/dto/identity.dto.ts",
      "apps/api/src/identity/guards/account-auth.guard.ts",
      "apps/api/src/identity/services/identity.service.ts",
      "apps/api/src/identity/repo/identity.repo.ts",
      "apps/api/prisma/schema.prisma",
      "apps/api/src/identity/identity.module.ts",
      "apps/api/src/identity/identity.types.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-identity",
        "reviewed_paths": [
          "apps/api/src/app.factory.ts",
          "apps/api/src/identity/controllers/account.controller.ts",
          "apps/api/src/identity/controllers/organizations.controller.ts",
          "apps/api/src/identity/dto/identity.dto.ts",
          "apps/api/src/identity/guards/account-auth.guard.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/src/identity/identity.module.ts",
          "apps/api/src/identity/identity.types.ts"
        ],
        "invariant": "Request bodies cannot replace the authenticated Account id, select an owner role, or grant operator-only OAuth scopes.",
        "method": "source",
        "result": "Controllers take accountId only from the guard-written request field. The guard verifies a bearer and loads the stored Account. Global DTO validation rejects undeclared properties; registration accepts only email/password, member addition fixes the role to member, and OAuth client creation checks its scope allowlist again in the service. Profile, password change and onboarding are the only AllowWithoutOrg routes. No parallel identity controller bypass was found.",
        "artifact": null
      },
      {
        "agent_id": "hunt-identity",
        "reviewed_paths": [
          "apps/api/src/identity/controllers/account.controller.ts",
          "apps/api/src/identity/controllers/organizations.controller.ts",
          "apps/api/src/identity/dto/identity.dto.ts",
          "apps/api/src/identity/guards/account-auth.guard.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/src/identity/repo/identity.repo.ts",
          "apps/api/prisma/schema.prisma"
        ],
        "invariant": "An owner selecting a person by email must not grant Organization membership to an attacker who merely registered that person's email first.",
        "method": "source",
        "result": "Public registration stores an arbitrary syntactically valid email with an attacker-chosen password. Neither the Account model nor the registration/login path records or requires mailbox proof. addMember does require an existing owner, but resolves the supplied email directly to that Account and immediately writes membership. The attacker can then discover the Organization through profile and pass the normal Project membership checks. This is an owner-interaction candidate; no unauthorized membership or read was executed.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "identity/register-addMember/unverified-email-membership"
    ],
    "unresolved": [
      "A bounded dummy-owner/attacker membership and Project-read check could not run: target execution is prohibited because complete OS memory and cumulative disk controls have not been established."
    ],
    "assignment_group": "identity",
    "priority": 1,
    "priority_reason": "Unauthenticated identity and Organization-owner controls protect account and tenant authority.",
    "hardening_notes": [
      "The zero-membership onboarding check is not serialized across concurrent distinct-slug requests. Its source-visible consequence is extra fresh self-owned Organizations, which the normal Organization-creation route already permits, so no security finding is claimed for that race.",
      "AccountAuthGuard could defensively require a nonempty string sub and a mandatory numeric exp before the repository lookup. The local issuer already creates a string Account id and finite expiration, and no attacker-controlled signed-token issuer or authentication bypass was found for these omitted explicit shape checks."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fidentity%2Fcontrollers%2Faccount.controller.ts%23AccountController::apps%2Fapi%2Fsrc%2Fidentity%2Fguards%2Faccount-auth.guard.ts%23AccountAuthGuard::apps%2Fapi%2Fsrc%2Fidentity::ATTACK-CLASSES.md%23Business%20logic",
    "canonical_refs": {
      "surface": "apps/api/src/identity/controllers/account.controller.ts#AccountController",
      "boundary": "apps/api/src/identity/guards/account-auth.guard.ts#AccountAuthGuard",
      "subsystem": "apps/api/src/identity",
      "attack_class": "ATTACK-CLASSES.md#Business logic"
    },
    "surface": "Account registration, login, Organization onboarding and OAuth client creation",
    "boundary": "Unauthenticated callers and Organization members to account sessions and owner authority",
    "subsystem": "apps/api/src/identity",
    "attack_class": "Bootstrap and onboarding state transitions",
    "starting_paths": [
      "apps/api/src/identity",
      "apps/api/src/auth/oauth-principal.ts",
      "apps/api/src/auth/services/oauth-token.service.ts",
      "apps/api/test/identity-security.e2e.test.ts",
      "apps/api/test/identity.e2e.test.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/identity; this unit covers Bootstrap and onboarding state transitions."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-identity",
    "reviewed_paths": [
      "apps/api/src/main.ts",
      "apps/api/src/config/boot.config.ts",
      "apps/api/src/config/env.schema.ts",
      "apps/api/src/identity/services/identity.service.ts",
      "apps/api/src/identity/repo/identity.repo.ts",
      "apps/api/src/identity/repo/identity.mapper.ts",
      "apps/api/src/identity/identity.types.ts",
      "apps/api/prisma/schema.prisma",
      "apps/api/test/identity-security.e2e.test.ts",
      "apps/api/test/identity.e2e.test.ts",
      "apps/api/src/identity/testing/fake-identity.repo.ts",
      "apps/api/test/database/identity-repo.db.test.ts",
      "docs/adr/0024-identity-and-root-admin.md"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-identity",
        "reviewed_paths": [
          "apps/api/src/main.ts",
          "apps/api/src/config/boot.config.ts",
          "apps/api/src/config/env.schema.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/src/identity/repo/identity.repo.ts",
          "apps/api/src/identity/repo/identity.mapper.ts",
          "apps/api/src/identity/identity.types.ts",
          "apps/api/prisma/schema.prisma",
          "apps/api/test/identity-security.e2e.test.ts",
          "apps/api/src/identity/testing/fake-identity.repo.ts",
          "apps/api/test/database/identity-repo.db.test.ts",
          "docs/adr/0024-identity-and-root-admin.md"
        ],
        "invariant": "Only configured first-boot root seeding can adopt migrated Projects, and a failed seed cannot expose a partial root identity through HTTP.",
        "method": "source",
        "result": "main awaits bootstrap before listen and closes the app on failure. Root keys are operator configuration and must be supplied together. bootstrapRoot rechecks Account count inside one transaction containing Account, Organization, owner Membership, migrated-Project adoption and grant writes. Uniqueness errors map to a conflict; the service suppresses a competing-seed conflict only when an Account exists. Public onboarding never calls adoption, and the unused adoption helper has no production caller. Existing rollback and competing-winner tests were read as source only.",
        "artifact": null
      },
      {
        "agent_id": "hunt-identity",
        "reviewed_paths": [
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/src/identity/repo/identity.repo.ts",
          "apps/api/prisma/schema.prisma",
          "apps/api/test/identity-security.e2e.test.ts",
          "apps/api/test/identity.e2e.test.ts",
          "apps/api/src/identity/testing/fake-identity.repo.ts"
        ],
        "invariant": "Onboarding and repeat Organization creation can only create a new Organization owned by the authenticated Account; neither can claim an existing tenant.",
        "method": "source",
        "result": "Onboarding checks for existing memberships and creates the Organization plus owner Membership in one transaction. A sequential replay conflicts. Ordinary Organization creation requires an existing Membership and deliberately permits several self-owned Organizations. Concurrent zero-membership checks are not serialized, but any resulting extra Organization is also fresh and self-owned, an effect already allowed after onboarding. Duplicate slugs cannot replace existing Organizations. The separate ensureGrant race can affect response success but does not grant another tenant's ownership. No security-boundary failure remains in these state transitions.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "identity",
    "priority": 1,
    "priority_reason": "Unauthenticated identity and Organization-owner controls protect account and tenant authority.",
    "hardening_notes": [
      "The zero-membership onboarding check is not serialized across concurrent distinct-slug requests. Its source-visible consequence is extra fresh self-owned Organizations, which the normal Organization-creation route already permits, so no security finding is claimed for that race.",
      "AccountAuthGuard could defensively require a nonempty string sub and a mandatory numeric exp before the repository lookup. The local issuer already creates a string Account id and finite expiration, and no attacker-controlled signed-token issuer or authentication bypass was found for these omitted explicit shape checks."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fidentity%2Fcontrollers%2Faccount.controller.ts%23AccountController::apps%2Fapi%2Fsrc%2Fidentity%2Fguards%2Faccount-auth.guard.ts%23AccountAuthGuard::apps%2Fapi%2Fsrc%2Fidentity::DATA-ISOLATION-AND-LIFECYCLE.md%23Missing%20tenant%20or%20owner%20enforcement",
    "canonical_refs": {
      "surface": "apps/api/src/identity/controllers/account.controller.ts#AccountController",
      "boundary": "apps/api/src/identity/guards/account-auth.guard.ts#AccountAuthGuard",
      "subsystem": "apps/api/src/identity",
      "attack_class": "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement"
    },
    "surface": "Account registration, login, Organization onboarding and OAuth client creation",
    "boundary": "Unauthenticated callers and Organization members to account sessions and owner authority",
    "subsystem": "apps/api/src/identity",
    "attack_class": "Owner and membership scope enforcement",
    "starting_paths": [
      "apps/api/src/identity",
      "apps/api/src/auth/oauth-principal.ts",
      "apps/api/src/auth/services/oauth-token.service.ts",
      "apps/api/test/identity-security.e2e.test.ts",
      "apps/api/test/identity.e2e.test.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "DATA-ISOLATION-AND-LIFECYCLE.md#Core discipline",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Universal moves",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/identity; this unit covers Owner and membership scope enforcement."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-identity",
    "reviewed_paths": [
      "docs/adr/0023-organization-is-the-tenant-root.md",
      "apps/api/src/identity/controllers/organizations.controller.ts",
      "apps/api/src/identity/guards/account-auth.guard.ts",
      "apps/api/src/identity/services/identity.service.ts",
      "apps/api/src/identity/repo/identity.repo.ts",
      "apps/api/src/identity/repo/identity.mapper.ts",
      "apps/api/prisma/schema.prisma",
      "apps/api/src/identity/dto/identity.dto.ts",
      "apps/api/src/auth/scopes.ts",
      "apps/api/test/identity.e2e.test.ts",
      "apps/api/test/identity-security.e2e.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-identity",
        "reviewed_paths": [
          "docs/adr/0023-organization-is-the-tenant-root.md",
          "apps/api/src/identity/controllers/organizations.controller.ts",
          "apps/api/src/identity/guards/account-auth.guard.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/src/identity/repo/identity.repo.ts",
          "apps/api/src/identity/repo/identity.mapper.ts",
          "apps/api/prisma/schema.prisma"
        ],
        "invariant": "Given a verified stored Account id, every identity Project read/write binds the selected Organization to that Account's stored Membership, and membership administration requires an owner of that same Organization.",
        "method": "source",
        "result": "listProjects and createProject call requireMembership(accountId, orgId), whose query is scoped to accountId and whose comparison uses the requested orgId. Project listing queries where orgId; slug lookup uses the composite orgId/slug key; new Projects take orgId from the checked route argument. addMember checks an owner Membership for the same orgId and inserts a fixed member role. The guard reloads Account and Membership state rather than trusting roles in a JWT. No missing Organization predicate or weaker sibling route was found. The separate unverified-email principal-selection candidate is linked to the access-control unit.",
        "artifact": null
      },
      {
        "agent_id": "hunt-identity",
        "reviewed_paths": [
          "apps/api/src/identity/controllers/organizations.controller.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/src/identity/repo/identity.repo.ts",
          "apps/api/src/identity/dto/identity.dto.ts",
          "apps/api/src/auth/scopes.ts",
          "apps/api/test/identity.e2e.test.ts",
          "apps/api/test/identity-security.e2e.test.ts"
        ],
        "invariant": "Only an owner can create an OAuth client, and that client's Project and scopes must remain within the selected Organization and public scope catalog.",
        "method": "source",
        "result": "createOAuthClient requires owner(accountId, orgId), loads the requested Project and compares project.orgId with orgId before storing the client. It generates the client id and secret itself, stores a SHA-256 digest of the random secret, and repeats the scope allowlist check in the service. config:export, tokens:manage and fix:trigger are outside the public catalog. The DTO rejects extra fields. Existing cross-Organization and forbidden-scope tests describe the same controls; they were not run. No cross-scope creation path remains in this unit.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "identity",
    "priority": 1,
    "priority_reason": "Unauthenticated identity and Organization-owner controls protect account and tenant authority.",
    "hardening_notes": [
      "The zero-membership onboarding check is not serialized across concurrent distinct-slug requests. Its source-visible consequence is extra fresh self-owned Organizations, which the normal Organization-creation route already permits, so no security finding is claimed for that race.",
      "AccountAuthGuard could defensively require a nonempty string sub and a mandatory numeric exp before the repository lookup. The local issuer already creates a string Account id and finite expiration, and no attacker-controlled signed-token issuer or authentication bypass was found for these omitted explicit shape checks."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fidentity%2Fcontrollers%2Faccount.controller.ts%23AccountController::apps%2Fapi%2Fsrc%2Fidentity%2Fguards%2Faccount-auth.guard.ts%23AccountAuthGuard::apps%2Fapi%2Fsrc%2Fidentity::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Pre-authentication%20work%20imbalance",
    "canonical_refs": {
      "surface": "apps/api/src/identity/controllers/account.controller.ts#AccountController",
      "boundary": "apps/api/src/identity/guards/account-auth.guard.ts#AccountAuthGuard",
      "subsystem": "apps/api/src/identity",
      "attack_class": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance"
    },
    "surface": "Account registration, login, Organization onboarding and OAuth client creation",
    "boundary": "Unauthenticated callers and Organization members to account sessions and owner authority",
    "subsystem": "apps/api/src/identity",
    "attack_class": "Identity pre-authentication work limits",
    "starting_paths": [
      "apps/api/src/identity",
      "apps/api/src/auth/oauth-principal.ts",
      "apps/api/src/auth/services/oauth-token.service.ts",
      "apps/api/test/identity-security.e2e.test.ts",
      "apps/api/test/identity.e2e.test.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Core discipline",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Pre-authentication work imbalance",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Universal moves",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/identity; this unit covers Identity pre-authentication work limits."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-identity",
    "reviewed_paths": [
      "package.json",
      "apps/api/src/app.factory.ts",
      "apps/api/src/app.module.ts",
      "apps/api/src/identity/identity.module.ts",
      "apps/api/src/identity/controllers/account.controller.ts",
      "apps/api/src/identity/dto/identity.dto.ts",
      "apps/api/src/identity/services/identity.service.ts",
      "apps/api/src/identity/repo/identity.repo.ts",
      "apps/api/src/auth/controllers/oauth.controller.ts",
      "apps/api/src/main.ts",
      "deploy/compose/graveshift.compose.yml"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-identity",
        "reviewed_paths": [
          "package.json",
          "apps/api/src/app.factory.ts",
          "apps/api/src/identity/controllers/account.controller.ts",
          "apps/api/src/identity/dto/identity.dto.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/src/identity/repo/identity.repo.ts"
        ],
        "invariant": "Cheap unauthenticated inputs must encounter an effective aggregate work bound before memory-hard password operations consume shared API resources.",
        "method": "source",
        "result": "Registration accepts email up to 254 characters and password from 12 to 256 characters, then performs an Argon2id hash and persists one Account for each unused email. Login for an existing Account invokes password verification even for a wrong password. Unknown-email login exits before verification. DTO and parser limits constrain one request's size, but these small accepted inputs reach the password API without a source-visible submission budget, service semaphore, deadline or cancellation path. No cost measurement, stress test or persistence fixture was run.",
        "artifact": null
      },
      {
        "agent_id": "hunt-identity",
        "reviewed_paths": [
          "apps/api/src/app.module.ts",
          "apps/api/src/identity/identity.module.ts",
          "apps/api/src/identity/controllers/account.controller.ts",
          "apps/api/src/auth/controllers/oauth.controller.ts",
          "apps/api/src/main.ts",
          "deploy/compose/graveshift.compose.yml"
        ],
        "invariant": "Configured throttling or deployment admission controls must actually cover registration/login before the expensive work begins.",
        "method": "source",
        "result": "AppModule configures ThrottlerModule but registers no global guard. Unlike OAuthController.token, AccountController.register/login have no ThrottlerGuard, and IdentityModule installs no alternative admission control. HTTP identity routes share the API process with other Organizations. The support Compose definition publishes the optional API only on loopback; remote exposure, upstream admission policy, Bun worker/queue bounds and effective CPU/memory budgets are not established by these sources. A shared-availability impact therefore remains conditional and needs validation.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "identity/register-login/unthrottled-argon2-work"
    ],
    "unresolved": [
      "No target execution is allowed without complete OS memory and cumulative disk controls, so no bounded admission or resource observation was made.",
      "The actual upstream rate/concurrency policy, identity-route exposure, Bun password-worker queue bounds and shared-process resource budget require an owner-observed configuration check."
    ],
    "assignment_group": "identity",
    "priority": 1,
    "priority_reason": "Unauthenticated identity and Organization-owner controls protect account and tenant authority.",
    "hardening_notes": [
      "The zero-membership onboarding check is not serialized across concurrent distinct-slug requests. Its source-visible consequence is extra fresh self-owned Organizations, which the normal Organization-creation route already permits, so no security finding is claimed for that race.",
      "AccountAuthGuard could defensively require a nonempty string sub and a mandatory numeric exp before the repository lookup. The local issuer already creates a string Account id and finite expiration, and no attacker-controlled signed-token issuer or authentication bypass was found for these omitted explicit shape checks."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fidentity%2Fcontrollers%2Faccount.controller.ts%23AccountController::apps%2Fapi%2Fsrc%2Fidentity%2Fguards%2Faccount-auth.guard.ts%23AccountAuthGuard::apps%2Fapi%2Fsrc%2Fidentity::WEB-PROTOCOL-AND-AUTH.md%23JWT%20verification%20and%20claim%20binding",
    "canonical_refs": {
      "surface": "apps/api/src/identity/controllers/account.controller.ts#AccountController",
      "boundary": "apps/api/src/identity/guards/account-auth.guard.ts#AccountAuthGuard",
      "subsystem": "apps/api/src/identity",
      "attack_class": "WEB-PROTOCOL-AND-AUTH.md#JWT verification and claim binding"
    },
    "surface": "Account registration, login, Organization onboarding and OAuth client creation",
    "boundary": "Unauthenticated callers and Organization members to account sessions and owner authority",
    "subsystem": "apps/api/src/identity",
    "attack_class": "JWT verification and claim binding",
    "starting_paths": [
      "apps/api/src/identity",
      "apps/api/src/auth/oauth-principal.ts",
      "apps/api/src/auth/services/oauth-token.service.ts",
      "apps/api/test/identity-security.e2e.test.ts",
      "apps/api/test/identity.e2e.test.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "WEB-PROTOCOL-AND-AUTH.md#Core discipline",
      "WEB-PROTOCOL-AND-AUTH.md#JWT verification and claim binding",
      "WEB-PROTOCOL-AND-AUTH.md#Universal moves",
      "WEB-PROTOCOL-AND-AUTH.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/identity; this unit covers JWT verification and claim binding."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-identity",
    "reviewed_paths": [
      "apps/api/src/identity/guards/account-auth.guard.ts",
      "apps/api/src/identity/services/identity.service.ts",
      "apps/api/src/identity/identity.types.ts",
      "apps/api/src/identity/repo/identity.repo.ts",
      "apps/api/src/auth/oauth-principal.ts",
      "apps/api/src/auth/services/oauth-token.service.ts",
      "apps/api/src/auth/oauth-client-access.strategy.ts",
      "apps/api/src/auth/oauth-client-credentials.strategy.ts",
      "apps/api/src/auth/auth.config.module.ts",
      "apps/api/src/auth/env.schema.ts",
      "apps/api/src/config/env.schema.ts",
      "apps/api/src/auth/scopes.ts",
      "apps/api/package.json",
      "bun.lock",
      "apps/api/src/auth/services/oauth-token.service.spec.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-identity",
        "reviewed_paths": [
          "apps/api/src/identity/guards/account-auth.guard.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/src/identity/identity.types.ts",
          "apps/api/src/config/env.schema.ts",
          "apps/api/package.json",
          "bun.lock"
        ],
        "invariant": "An Account bearer must be signed by the configured issuer for the fixed Account audience and bind to an existing Account; attacker-supplied JWT headers must not select an algorithm or key.",
        "method": "source",
        "result": "Account issuance pins HS256, the configured secret/issuer, graveshift-account audience and a 3600-second expiry. The guard calls verifyAsync with the same issuer/audience and algorithms restricted to HS256, then queries the Account by sub. No decode-only path, request-selected key, kid/jku/x5u fetch, or ignoreExpiration/ignoreNotBefore option is present. Versions are pinned, including @nestjs/jwt 12.0.5 and jsonwebtoken 9.0.3 in bun.lock. The operator secret is required at boot. No source-visible invalid-signature, foreign-audience or alternate-principal acceptance path was found; malformed-token fixtures were not executed.",
        "artifact": null
      },
      {
        "agent_id": "hunt-identity",
        "reviewed_paths": [
          "apps/api/src/identity/repo/identity.repo.ts",
          "apps/api/src/auth/oauth-principal.ts",
          "apps/api/src/auth/services/oauth-token.service.ts",
          "apps/api/src/auth/oauth-client-access.strategy.ts",
          "apps/api/src/auth/oauth-client-credentials.strategy.ts",
          "apps/api/src/auth/auth.config.module.ts",
          "apps/api/src/auth/env.schema.ts",
          "apps/api/src/config/env.schema.ts",
          "apps/api/src/auth/scopes.ts",
          "apps/api/src/auth/services/oauth-token.service.spec.ts"
        ],
        "invariant": "OAuth credentials must authenticate a stored client, issue only its stored Project/scope grant, and remain distinct from Account sessions.",
        "method": "source",
        "result": "Exchange loads a stored client, compares a fixed-length SHA-256 digest with timingSafeEqual, and issues a five-minute HS256 token using only stored projectId/scopes. Both Passport strategies pin issuer, audience, algorithm and key. verifyOAuthPrincipal requires an unexpired numeric exp, exact issuer/audience, a numeric Project id, a current matching client and a scope subset of its current stored grant. Endpoint strategies additionally require their exact management/config scope. Account JWTs lack the OAuth Project/scope claims; OAuth client subjects are generated client ids and must separately resolve to an Account for Account routes. Public issuance gives no attacker-selected Account subject. No reachable token-type confusion was found.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "identity",
    "priority": 1,
    "priority_reason": "Unauthenticated identity and Organization-owner controls protect account and tenant authority.",
    "hardening_notes": [
      "The zero-membership onboarding check is not serialized across concurrent distinct-slug requests. Its source-visible consequence is extra fresh self-owned Organizations, which the normal Organization-creation route already permits, so no security finding is claimed for that race.",
      "AccountAuthGuard could defensively require a nonempty string sub and a mandatory numeric exp before the repository lookup. The local issuer already creates a string Account id and finite expiration, and no attacker-controlled signed-token issuer or authentication bypass was found for these omitted explicit shape checks."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fidentity%2Fcontrollers%2Faccount.controller.ts%23AccountController::apps%2Fapi%2Fsrc%2Fidentity%2Fguards%2Faccount-auth.guard.ts%23AccountAuthGuard::apps%2Fapi%2Fsrc%2Fidentity::WEB-PROTOCOL-AND-AUTH.md%23Session%20fixation%20and%20invalidation",
    "canonical_refs": {
      "surface": "apps/api/src/identity/controllers/account.controller.ts#AccountController",
      "boundary": "apps/api/src/identity/guards/account-auth.guard.ts#AccountAuthGuard",
      "subsystem": "apps/api/src/identity",
      "attack_class": "WEB-PROTOCOL-AND-AUTH.md#Session fixation and invalidation"
    },
    "surface": "Account registration, login, Organization onboarding and OAuth client creation",
    "boundary": "Unauthenticated callers and Organization members to account sessions and owner authority",
    "subsystem": "apps/api/src/identity",
    "attack_class": "Account session invalidation",
    "starting_paths": [
      "apps/api/src/identity",
      "apps/api/src/auth/oauth-principal.ts",
      "apps/api/src/auth/services/oauth-token.service.ts",
      "apps/api/test/identity-security.e2e.test.ts",
      "apps/api/test/identity.e2e.test.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "WEB-PROTOCOL-AND-AUTH.md#Core discipline",
      "WEB-PROTOCOL-AND-AUTH.md#Session fixation and invalidation",
      "WEB-PROTOCOL-AND-AUTH.md#Universal moves",
      "WEB-PROTOCOL-AND-AUTH.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/identity; this unit covers Account session invalidation."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-identity",
    "reviewed_paths": [
      "apps/api/src/identity/controllers/account.controller.ts",
      "apps/api/src/identity/controllers/organizations.controller.ts",
      "apps/api/src/identity/guards/account-auth.guard.ts",
      "apps/api/src/identity/services/identity.service.ts",
      "apps/api/src/identity/repo/identity.repo.ts",
      "apps/api/src/identity/identity.types.ts",
      "apps/api/prisma/schema.prisma",
      "apps/api/test/identity.e2e.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-identity",
        "reviewed_paths": [
          "apps/api/src/identity/controllers/account.controller.ts",
          "apps/api/src/identity/guards/account-auth.guard.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/src/identity/repo/identity.repo.ts",
          "apps/api/src/identity/identity.types.ts",
          "apps/api/prisma/schema.prisma"
        ],
        "invariant": "A password change must prevent other holders of pre-change bearer tokens from retaining or gaining the Account's protected authority.",
        "method": "source",
        "result": "Login issues a one-hour JWT containing sub/email with no session id or password epoch. changePassword checks the current password, then setPassword changes only passwordHash and mustChangePassword. The Account record has no session-revocation state, and the guard compares neither JWT issue time nor a version against the password change. Account existence, signature, audience, expiry and current Membership checks remain effective, but none invalidates another holder's old bearer. No two-session check was executed.",
        "artifact": null
      },
      {
        "agent_id": "hunt-identity",
        "reviewed_paths": [
          "apps/api/src/identity/controllers/organizations.controller.ts",
          "apps/api/src/identity/guards/account-auth.guard.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/test/identity.e2e.test.ts"
        ],
        "invariant": "Completion of the bootstrap password change must not silently upgrade independently held first-login tokens to owner-capable sessions.",
        "method": "source",
        "result": "The guard reads current mustChangePassword from storage on each request. Once the legitimate holder changes the password, every still-valid pre-change bearer sees false and can reach protected Organization routes using the stored owner Membership. The existing identity e2e test explicitly reuses its pre-change token after changing the password; that is test source, not an observed run, and it does not distinguish another session from the caller's current one. The candidate stops at creation of a dummy Project-bound OAuth client under the Account's existing Organization, not deployment-wide administration.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "identity/account-password-change/stale-jwt"
    ],
    "unresolved": [
      "An isolated two-session password-change and first-login transition check is blocked by the source-only policy and the absence of complete OS memory and cumulative disk controls; no stale-token authorization result was observed."
    ],
    "assignment_group": "identity",
    "priority": 1,
    "priority_reason": "Unauthenticated identity and Organization-owner controls protect account and tenant authority.",
    "hardening_notes": [
      "The zero-membership onboarding check is not serialized across concurrent distinct-slug requests. Its source-visible consequence is extra fresh self-owned Organizations, which the normal Organization-creation route already permits, so no security finding is claimed for that race.",
      "AccountAuthGuard could defensively require a nonempty string sub and a mandatory numeric exp before the repository lookup. The local issuer already creates a string Account id and finite expiration, and no attacker-controlled signed-token issuer or authentication bypass was found for these omitted explicit shape checks."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fmcp%2Fmcp.module.ts%23GraveshiftMcpModule::apps%2Fapi%2Fsrc%2Fmcp%2Fmcp-token.verifier.ts%23McpBearerGuard::apps%2Fapi%2Fsrc%2Fmcp::AI-AND-LLM.md%23Tool-schema%20and%20dispatcher%20disagreement",
    "canonical_refs": {
      "surface": "apps/api/src/mcp/mcp.module.ts#GraveshiftMcpModule",
      "boundary": "apps/api/src/mcp/mcp-token.verifier.ts#McpBearerGuard",
      "subsystem": "apps/api/src/mcp",
      "attack_class": "AI-AND-LLM.md#Tool-schema and dispatcher disagreement"
    },
    "surface": "MCP HTTP/stdio tools, resources, prompts, and API-to-daemon reads",
    "boundary": "Scoped MCP reader to Project context and host-wide collector evidence",
    "subsystem": "apps/api/src/mcp",
    "attack_class": "MCP schema and dispatch agreement",
    "starting_paths": [
      "apps/api/src/mcp",
      "apps/api/src/stdio.ts",
      "apps/daemon/src/read-handler.ts",
      "apps/daemon/src/reads.ts",
      "apps/daemon/src/routes.ts",
      "apps/daemon/src/private-http.ts",
      "apps/daemon/src/collectors.ts",
      "packages/mcp-client/src",
      "packages/metrics/src"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Injection",
    "selected_companion_blocks": [
      "AI-AND-LLM.md#Core discipline",
      "AI-AND-LLM.md#Tool-schema and dispatcher disagreement",
      "AI-AND-LLM.md#Universal moves",
      "AI-AND-LLM.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/mcp; this unit covers MCP schema and dispatch agreement."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-mcp-read",
    "reviewed_paths": [
      "apps/api/src/mcp/mcp.tools.ts",
      "apps/api/src/mcp/mcp.resources.ts",
      "apps/api/src/mcp/mcp.prompts.ts",
      "apps/api/src/mcp/mcp.promql.ts",
      "apps/api/src/mcp/mcp.backend.ts",
      "apps/api/src/mcp/mcp.types.ts",
      "apps/daemon/src/read-handler.ts",
      "apps/daemon/src/reads.ts",
      "packages/core/src/schemas.ts",
      "packages/core/src/recorded.ts",
      "packages/metrics/src/queries.ts",
      "packages/mcp-client/src/catalog.ts",
      "packages/mcp-client/src/client.ts",
      "apps/api/node_modules/@nestjs/mcp/dist/services/mcp-server.factory.js"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-mcp-read",
        "reviewed_paths": [
          "apps/api/src/mcp/mcp.tools.ts",
          "apps/api/src/mcp/mcp.resources.ts",
          "apps/api/src/mcp/mcp.prompts.ts",
          "apps/api/src/mcp/mcp.promql.ts",
          "apps/api/src/mcp/mcp.backend.ts",
          "apps/daemon/src/read-handler.ts",
          "apps/daemon/src/reads.ts",
          "packages/core/src/schemas.ts",
          "packages/core/src/recorded.ts",
          "packages/metrics/src/queries.ts",
          "packages/mcp-client/src/catalog.ts",
          "packages/mcp-client/src/client.ts",
          "apps/api/node_modules/@nestjs/mcp/dist/services/mcp-server.factory.js"
        ],
        "invariant": "The final server-validated tool arguments must determine the same action and resource selectors that the daemon interprets; caller fields must not replace authenticated Project identity or select a different capability.",
        "method": "source",
        "result": "The nine tools use fixed dispatch names. Selector-bearing tool schemas reject extra fields and bound identifiers, limits, lines, action names and replicas. The backend constructs Project identity from McpProjectContext and only adds fields assembled by its fixed methods. The daemon reparses a strict discriminated command before dispatch. Its broader identifier and line bounds do not reinterpret values accepted by the narrower external schemas. Resource identifiers become a JSON body value, not a filesystem or command path. Prompt schemas strip unknown fields and interpolate only the declared string. The client validates tool input but sends the original object, so defaults are applied again by the authoritative server; no security-relevant normalization divergence was found. PromQL's lexical check is followed by exact equality against WATCHER_QUERIES for configured jobs, so alternate syntax, quoted text or range-parser gaps cannot reach a different query through this read path. The configured-job ownership issue is recorded separately under collector isolation. No schema-to-dispatch authority change survived source review.",
        "artifact": null
      },
      {
        "agent_id": "hunt-mcp-read",
        "reviewed_paths": [
          "apps/api/src/mcp/mcp.tools.ts",
          "apps/api/src/mcp/mcp.backend.ts",
          "apps/api/src/mcp/mcp.types.ts"
        ],
        "invariant": "Model-facing proposals must not become runtime execution or publication authority, including malformed, missing-context and failed-audit paths.",
        "method": "source",
        "result": "The execution identities are a scoped MCP Credential, the API's daemon bearer, the daemon's API bearer, the collectors' infrastructure credentials and a trusted local stdio process. Caller-controlled inputs are tool arguments, prompt arguments and resource identifiers; collector evidence and stored Diagnosis text remain lower-trust context. Outputs are MCP replies and, for proposals, an API-owned audit append. McpBackend exposes no execution method. proposeFix requires a Project before reads, builds its action from the validated enum and replicas, checks the daemon context against the incident, denies missing or inconsistent policy facts, and withholds its result unless the exact draft key is acknowledged. Its response always states executed=false. No in-scope queued, retry or alternate dispatcher exposes an action execution sink.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "mcp-read",
    "priority": 5,
    "priority_reason": "MCP exposes scoped data to agents and crosses from authenticated Project context into daemon source reads.",
    "hardening_notes": [
      "Align the resource permission key in apps/api/src/mcp/mcp.permissions.ts:17 with the registered name Autopsy in apps/api/src/mcp/mcp.resources.ts:16. The inspected installed @nestjs/mcp factory passes the registered name to McpScopeGuard, so the current postmortem key fails closed for authenticated resource calls. A positive-scope HTTP resource case should check that behavior; this is an access failure, not a demonstrated security bypass.",
      "packages/mcp-client/src/reply.ts:48 should compare the single returned resource URI with the requested URI as well as checking text, cardinality and MIME type. Only the caller-selected connection can currently supply that reply, and no separate affected principal or privileged consumer was found, so this remains response-validation hardening."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fmcp%2Fmcp.module.ts%23GraveshiftMcpModule::apps%2Fapi%2Fsrc%2Fmcp%2Fmcp-token.verifier.ts%23McpBearerGuard::apps%2Fapi%2Fsrc%2Fmcp::ATTACK-CLASSES.md%23Feature%20abuse%20and%20data%20leakage",
    "canonical_refs": {
      "surface": "apps/api/src/mcp/mcp.module.ts#GraveshiftMcpModule",
      "boundary": "apps/api/src/mcp/mcp-token.verifier.ts#McpBearerGuard",
      "subsystem": "apps/api/src/mcp",
      "attack_class": "ATTACK-CLASSES.md#Feature abuse and data leakage"
    },
    "surface": "MCP HTTP/stdio tools, resources, prompts, and API-to-daemon reads",
    "boundary": "Scoped MCP reader to Project context and host-wide collector evidence",
    "subsystem": "apps/api/src/mcp",
    "attack_class": "MCP data projection and redaction",
    "starting_paths": [
      "apps/api/src/mcp",
      "apps/api/src/stdio.ts",
      "apps/daemon/src/read-handler.ts",
      "apps/daemon/src/reads.ts",
      "apps/daemon/src/routes.ts",
      "apps/daemon/src/private-http.ts",
      "apps/daemon/src/collectors.ts",
      "packages/mcp-client/src",
      "packages/metrics/src"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/mcp; this unit covers MCP data projection and redaction."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-mcp-read",
    "reviewed_paths": [
      "apps/api/src/mcp/mcp.permissions.ts",
      "apps/api/src/mcp/mcp-http-scope.guard.ts",
      "apps/api/src/mcp/mcp-scope.guard.ts",
      "apps/api/src/mcp/mcp-token.verifier.ts",
      "apps/api/src/auth/services/credential.service.ts",
      "apps/api/src/auth/scopes.ts",
      "apps/api/src/mcp/mcp.tools.ts",
      "apps/api/src/mcp/mcp.backend.ts",
      "apps/daemon/src/read-handler.ts",
      "apps/daemon/src/reads.ts",
      "apps/api/src/hauntings/haunting.repo.ts",
      "apps/api/src/hauntings/haunting.mapper.ts",
      "apps/api/src/mcp/mcp.redact.ts",
      "apps/api/src/mcp/mcp.resources.ts",
      "apps/api/src/mcp/mcp.postmortem.ts",
      "apps/api/src/mcp/mcp.prompts.ts",
      "apps/api/src/mcp/events/events.service.ts",
      "apps/api/src/mcp/events/events.types.ts",
      "packages/core/src/recorded.ts",
      "packages/core/src/privacy.ts",
      "packages/core/src/envelope.ts",
      "packages/core/src/schemas.ts",
      "packages/redactor/src/index.ts",
      "packages/redactor/src/detectors.ts",
      "docs/adr/0019-event-identity-and-privacy.md"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-mcp-read",
        "reviewed_paths": [
          "apps/api/src/mcp/mcp.permissions.ts",
          "apps/api/src/mcp/mcp-http-scope.guard.ts",
          "apps/api/src/mcp/mcp-scope.guard.ts",
          "apps/api/src/mcp/mcp-token.verifier.ts",
          "apps/api/src/auth/services/credential.service.ts",
          "apps/api/src/auth/scopes.ts",
          "apps/api/src/mcp/mcp.tools.ts",
          "apps/api/src/mcp/mcp.backend.ts",
          "apps/daemon/src/read-handler.ts",
          "apps/daemon/src/reads.ts",
          "apps/api/src/hauntings/haunting.repo.ts",
          "apps/api/src/hauntings/haunting.mapper.ts",
          "apps/api/src/mcp/mcp.redact.ts",
          "packages/core/src/recorded.ts",
          "packages/core/src/schemas.ts"
        ],
        "invariant": "A response admitted under incidents:read must not disclose a Diagnosis whose direct read requires the absent diagnoses:read scope.",
        "method": "source",
        "result": "Both scope layers map list_incidents and get_incident to incidents:read and get_diagnosis to diagnoses:read. Credential verification returns the issued scope set without adding the missing MCP scope. However, both incident tools return the complete RecordedHaunting, whose incident field includes the full optional Diagnosis. The durable Project-scoped query, mapper, daemon parser and backend preserve that field. deepRedact changes string content but performs no scope-dependent projection. This leaves a source-grounded alternate read of Diagnosis rootCause, evidence and confidence for a token denied the direct Diagnosis tool. Behavioral proof and the real HTTP Project-context handoff remain unvalidated.",
        "artifact": null
      },
      {
        "agent_id": "hunt-mcp-read",
        "reviewed_paths": [
          "apps/api/src/mcp/mcp.tools.ts",
          "apps/api/src/mcp/mcp.redact.ts",
          "apps/api/src/mcp/mcp.resources.ts",
          "apps/api/src/mcp/mcp.postmortem.ts",
          "apps/api/src/mcp/mcp.prompts.ts",
          "apps/api/src/mcp/events/events.service.ts",
          "apps/api/src/mcp/events/events.types.ts",
          "packages/core/src/recorded.ts",
          "packages/core/src/privacy.ts",
          "packages/core/src/envelope.ts",
          "packages/redactor/src/index.ts",
          "packages/redactor/src/detectors.ts",
          "docs/adr/0019-event-identity-and-privacy.md"
        ],
        "invariant": "MCP output must preserve only the intended identity metadata and must process untrusted free text and projected Event payloads before disclosure.",
        "method": "source",
        "result": "Tool and prompt replies traverse deepRedact, including object keys. Autopsy uses prepareRecordedHaunting, which checks metadata and redacts Diagnosis text, evidence excerpts, detection messages and timeline details. Event occurrence construction reparses through prepareEnvelope, removes sensitive payload fields, projects a fixed per-type schema and redacts free text. Its identity-key exceptions match ADR 0019 and do not permit arbitrary nested payload fields through the fixed projection. A log line can close the textual untrusted_logs wrapper, but no deterministic authority change or privileged sink follows from that alone. No additional redaction vulnerability was established within this unit; redaction does not remedy the separate scope-projection candidate.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "apps/api/src/mcp/mcp.tools.ts:incident-read-embeds-diagnosis"
    ],
    "unresolved": [
      "No bounded dummy-Credential check was executed. Complete OS-enforced memory and cumulative-disk sandbox controls are unavailable, and the assignment prohibits target execution.",
      "The actual bearer-guard-to-HttpMcpBackend Project-context handoff must be exercised without substituting McpProjectContext or MCP_BACKEND before claiming an HTTP disclosure."
    ],
    "assignment_group": "mcp-read",
    "priority": 5,
    "priority_reason": "MCP exposes scoped data to agents and crosses from authenticated Project context into daemon source reads.",
    "hardening_notes": [
      "Align the resource permission key in apps/api/src/mcp/mcp.permissions.ts:17 with the registered name Autopsy in apps/api/src/mcp/mcp.resources.ts:16. The inspected installed @nestjs/mcp factory passes the registered name to McpScopeGuard, so the current postmortem key fails closed for authenticated resource calls. A positive-scope HTTP resource case should check that behavior; this is an access failure, not a demonstrated security bypass.",
      "packages/mcp-client/src/reply.ts:48 should compare the single returned resource URI with the requested URI as well as checking text, cardinality and MIME type. Only the caller-selected connection can currently supply that reply, and no separate affected principal or privileged consumer was found, so this remains response-validation hardening."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fmcp%2Fmcp.module.ts%23GraveshiftMcpModule::apps%2Fapi%2Fsrc%2Fmcp%2Fmcp-token.verifier.ts%23McpBearerGuard::apps%2Fapi%2Fsrc%2Fmcp::DATA-ISOLATION-AND-LIFECYCLE.md%23Missing%20tenant%20or%20owner%20enforcement",
    "canonical_refs": {
      "surface": "apps/api/src/mcp/mcp.module.ts#GraveshiftMcpModule",
      "boundary": "apps/api/src/mcp/mcp-token.verifier.ts#McpBearerGuard",
      "subsystem": "apps/api/src/mcp",
      "attack_class": "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement"
    },
    "surface": "MCP HTTP/stdio tools, resources, prompts, and API-to-daemon reads",
    "boundary": "Scoped MCP reader to Project context and host-wide collector evidence",
    "subsystem": "apps/api/src/mcp",
    "attack_class": "MCP and collector Project isolation",
    "starting_paths": [
      "apps/api/src/mcp",
      "apps/api/src/stdio.ts",
      "apps/daemon/src/read-handler.ts",
      "apps/daemon/src/reads.ts",
      "apps/daemon/src/routes.ts",
      "apps/daemon/src/private-http.ts",
      "apps/daemon/src/collectors.ts",
      "packages/mcp-client/src",
      "packages/metrics/src"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "DATA-ISOLATION-AND-LIFECYCLE.md#Core discipline",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Universal moves",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/mcp; this unit covers MCP and collector Project isolation."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-mcp-read",
    "reviewed_paths": [
      "GLOSSARY.md",
      "docs/adr/0023-organization-is-the-tenant-root.md",
      "apps/api/src/mcp/mcp-token.verifier.ts",
      "apps/api/src/mcp/mcp-project-context.ts",
      "apps/api/src/mcp/mcp.permissions.ts",
      "apps/api/src/mcp/mcp.tools.ts",
      "apps/api/src/mcp/mcp.backend.ts",
      "apps/daemon/src/main.ts",
      "apps/daemon/src/read-handler.ts",
      "apps/daemon/src/reads.ts",
      "apps/daemon/src/collectors.ts",
      "packages/integrations/src/reads.ts",
      "packages/sources-docker/src/source.ts",
      "packages/sources-docker/src/api.ts",
      "packages/sources-k8s/src/source.ts",
      "packages/sources-k8s/src/kube-api.ts",
      "packages/metrics/src/queries.ts",
      "packages/metrics/src/client.ts",
      "packages/metrics/src/collector.ts",
      "apps/daemon/src/api-client.ts",
      "apps/api/src/hauntings/haunting.controller.ts",
      "apps/api/src/hauntings/haunting.service.ts",
      "apps/api/src/hauntings/haunting.repo.ts",
      "apps/api/src/internal/project-grant.ts",
      "apps/api/src/audit/audit.repo.ts",
      "apps/api/src/mcp/events/events.bridge.ts",
      "apps/api/src/mcp/events/events.service.ts",
      "apps/api/src/mcp/events/events.source.ts",
      "apps/daemon/src/reads.test.ts",
      "apps/api/test/mcp-http.e2e.test.ts",
      "apps/api/src/mcp/mcp-daemon-read.fixture.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-mcp-read",
        "reviewed_paths": [
          "GLOSSARY.md",
          "docs/adr/0023-organization-is-the-tenant-root.md",
          "apps/api/src/mcp/mcp-token.verifier.ts",
          "apps/api/src/mcp/mcp-project-context.ts",
          "apps/api/src/mcp/mcp.permissions.ts",
          "apps/api/src/mcp/mcp.tools.ts",
          "apps/api/src/mcp/mcp.backend.ts",
          "apps/daemon/src/main.ts",
          "apps/daemon/src/read-handler.ts",
          "apps/daemon/src/reads.ts",
          "apps/daemon/src/collectors.ts",
          "packages/integrations/src/reads.ts",
          "packages/sources-docker/src/source.ts",
          "packages/sources-docker/src/api.ts",
          "packages/sources-k8s/src/source.ts",
          "packages/sources-k8s/src/kube-api.ts",
          "packages/metrics/src/queries.ts",
          "packages/metrics/src/client.ts",
          "packages/metrics/src/collector.ts",
          "apps/daemon/src/reads.test.ts",
          "apps/api/test/mcp-http.e2e.test.ts",
          "apps/api/src/mcp/mcp-daemon-read.fixture.ts"
        ],
        "invariant": "Admission of one granted Project must not authorize that Project's MCP reader to enumerate or read another Project's collector inventory, logs or metrics through shared host credentials.",
        "method": "source",
        "result": "The bearer guard supplies a stored Project and the backend sends it to the private daemon, where projectIds membership is checked. After that check, logs(service,lines) and metric(promql) omit Project identity. services(projectId) also returns the entire collector inventory, merely overlaying incident state from that Project. main.ts shares one collector set across every granted Project and starts collectors under the first granted Project. Docker lists all containers and resolves logs only by service name. Kubernetes applies a daemon-wide namespace list and resolves deployments and pod logs without a requesting Project. Metrics use every configured job in a daemon-wide exact allowlist, with no Project-to-job binding. The Project-grant check, unique service-match check, namespace filter, exact PromQL allowlist and redaction are the strongest visible controls; none checks ownership of the final evidence resource. This is one root cause with inventory, Docker/Kubernetes log and metric variants. Runtime boundary proof is blocked; existing source tests verify grant admission and global reads separately, not cross-Project evidence denial.",
        "artifact": null
      },
      {
        "agent_id": "hunt-mcp-read",
        "reviewed_paths": [
          "apps/api/src/mcp/mcp.backend.ts",
          "apps/daemon/src/read-handler.ts",
          "apps/daemon/src/reads.ts",
          "apps/daemon/src/api-client.ts",
          "apps/api/src/hauntings/haunting.controller.ts",
          "apps/api/src/hauntings/haunting.service.ts",
          "apps/api/src/hauntings/haunting.repo.ts",
          "apps/api/src/internal/project-grant.ts",
          "apps/api/src/audit/audit.repo.ts",
          "apps/api/src/mcp/events/events.bridge.ts",
          "apps/api/src/mcp/events/events.service.ts",
          "apps/api/src/mcp/events/events.source.ts"
        ],
        "invariant": "Durable incident, context, counters, audit and Event reads must retain the authenticated Project through each query and alternate transport path.",
        "method": "source",
        "result": "Incident and context commands retain projectId through the daemon's private API client. HauntingService checks the stored grant and HauntingRepo binds list queries to projectId and direct reads to the composite projectId_id key. Context additionally checks service, Diagnosis and detection-Project facts; counters derive from that checked context. Audit list and chain verification query by projectId. EventsBridge requires a Project for list and poll, resolves the request Credential, and passes its Project and scopes to EventPollService. Poll enforces the descriptor scope and filters the stored envelope's Project before projection; caller filters and cursors cannot replace it. A Projectless stdio Event caller is refused. No additional missing-Project query was found on these durable or Event read paths. No claim is made about peer-owned Event ingestion or broker policy.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "apps/daemon/src/reads.ts:collector-evidence-without-project"
    ],
    "unresolved": [
      "Cross-Project collector disclosure has not been observed using dummy tenants; target execution is blocked by missing complete OS-enforced memory and cumulative-disk controls.",
      "An end-to-end check must establish the real HTTP Project-context propagation and show that a collector resource reserved for one Project is returned to a different granted Project. The source review did not read deployment secrets, local configuration or live workload ownership."
    ],
    "assignment_group": "mcp-read",
    "priority": 5,
    "priority_reason": "MCP exposes scoped data to agents and crosses from authenticated Project context into daemon source reads.",
    "hardening_notes": [
      "Align the resource permission key in apps/api/src/mcp/mcp.permissions.ts:17 with the registered name Autopsy in apps/api/src/mcp/mcp.resources.ts:16. The inspected installed @nestjs/mcp factory passes the registered name to McpScopeGuard, so the current postmortem key fails closed for authenticated resource calls. A positive-scope HTTP resource case should check that behavior; this is an access failure, not a demonstrated security bypass.",
      "packages/mcp-client/src/reply.ts:48 should compare the single returned resource URI with the requested URI as well as checking text, cardinality and MIME type. Only the caller-selected connection can currently supply that reply, and no separate affected principal or privileged consumer was found, so this remains response-validation hardening."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fmcp%2Fmcp.module.ts%23GraveshiftMcpModule::apps%2Fapi%2Fsrc%2Fmcp%2Fmcp-token.verifier.ts%23McpBearerGuard::apps%2Fapi%2Fsrc%2Fmcp::PROTOCOLS-RPC-AND-MESSAGING.md%23Interceptor%20and%20method-path%20inconsistency",
    "canonical_refs": {
      "surface": "apps/api/src/mcp/mcp.module.ts#GraveshiftMcpModule",
      "boundary": "apps/api/src/mcp/mcp-token.verifier.ts#McpBearerGuard",
      "subsystem": "apps/api/src/mcp",
      "attack_class": "PROTOCOLS-RPC-AND-MESSAGING.md#Interceptor and method-path inconsistency"
    },
    "surface": "MCP HTTP/stdio tools, resources, prompts, and API-to-daemon reads",
    "boundary": "Scoped MCP reader to Project context and host-wide collector evidence",
    "subsystem": "apps/api/src/mcp",
    "attack_class": "MCP HTTP and stdio access policy equivalence",
    "starting_paths": [
      "apps/api/src/mcp",
      "apps/api/src/stdio.ts",
      "apps/daemon/src/read-handler.ts",
      "apps/daemon/src/reads.ts",
      "apps/daemon/src/routes.ts",
      "apps/daemon/src/private-http.ts",
      "apps/daemon/src/collectors.ts",
      "packages/mcp-client/src",
      "packages/metrics/src"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "PROTOCOLS-RPC-AND-MESSAGING.md#Core discipline",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Interceptor and method-path inconsistency",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Universal moves",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/mcp; this unit covers MCP HTTP and stdio access policy equivalence."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-mcp-read",
    "reviewed_paths": [
      "apps/api/src/app.module.ts",
      "apps/api/src/app.factory.ts",
      "apps/api/src/stdio.ts",
      "apps/api/src/mcp/mcp.module.ts",
      "apps/api/src/mcp/mcp-token.verifier.ts",
      "apps/api/src/mcp/mcp-http-scope.guard.ts",
      "apps/api/src/mcp/mcp-scope.guard.ts",
      "apps/api/src/mcp/mcp.permissions.ts",
      "apps/api/src/mcp/mcp-project-context.ts",
      "apps/api/src/mcp/mcp.backend.ts",
      "apps/api/src/mcp/mcp.tools.ts",
      "apps/api/src/mcp/mcp.resources.ts",
      "apps/api/src/mcp/mcp.prompts.ts",
      "apps/api/src/mcp/events/events.bridge.ts",
      "apps/api/src/mcp/events/events.service.ts",
      "apps/api/node_modules/@nestjs/mcp/dist/http/mcp-http.controller.js",
      "apps/api/node_modules/@nestjs/mcp/dist/http/mcp-http.service.js",
      "apps/api/node_modules/@nestjs/mcp/dist/services/mcp-server.factory.js",
      "apps/api/node_modules/@nestjs/mcp/dist/context/mcp-execution-context.js",
      "docs/adr/0006-nestjs-api-and-mcp.md"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-mcp-read",
        "reviewed_paths": [
          "apps/api/src/app.module.ts",
          "apps/api/src/app.factory.ts",
          "apps/api/src/mcp/mcp.module.ts",
          "apps/api/src/mcp/mcp-token.verifier.ts",
          "apps/api/src/mcp/mcp-http-scope.guard.ts",
          "apps/api/src/mcp/mcp-scope.guard.ts",
          "apps/api/src/mcp/mcp.permissions.ts",
          "apps/api/src/mcp/mcp.resources.ts",
          "apps/api/src/mcp/events/events.bridge.ts",
          "apps/api/src/mcp/events/events.service.ts",
          "apps/api/node_modules/@nestjs/mcp/dist/http/mcp-http.controller.js",
          "apps/api/node_modules/@nestjs/mcp/dist/http/mcp-http.service.js",
          "apps/api/node_modules/@nestjs/mcp/dist/services/mcp-server.factory.js",
          "apps/api/node_modules/@nestjs/mcp/dist/context/mcp-execution-context.js"
        ],
        "invariant": "Every HTTP access path to the same MCP operation must retain bearer authentication and the operation's scope, including batches, discovery, legacy/modern dispatch and custom Event methods.",
        "method": "source",
        "result": "GraveshiftMcpModule applies ThrottlerGuard, McpBearerGuard and McpHttpScopeGuard to the generated HTTP controller. The inspected installed controller uses an All route, and its stateless service creates a server per HTTP request. The scope guard checks every body entry before dispatch, denies unknown methods, and cannot gain scope through params.arguments. The primitive guard independently checks the named tool or prompt using the current SDK context or platform request's authInfo. Event handlers bypass primitive decorators but explicitly resolve the caller and require a Project; poll also checks the Event type's scope. Push/webhook methods are denied at the HTTP layer and unsupported in the bridge. Protocol and notification exceptions still run after bearer authentication and expose no in-scope private read of their own. The resource registration uses name Autopsy while the permission table uses postmortem; the installed SDK passes the registered name to the primitive guard, which denies it by default. That mismatch fails closed and is a non-finding note. No weaker transport or method path to the assigned operations was found.",
        "artifact": null
      },
      {
        "agent_id": "hunt-mcp-read",
        "reviewed_paths": [
          "apps/api/src/stdio.ts",
          "apps/api/src/mcp/mcp.module.ts",
          "apps/api/src/mcp/mcp-project-context.ts",
          "apps/api/src/mcp/mcp.backend.ts",
          "apps/api/src/mcp/mcp.tools.ts",
          "apps/api/src/mcp/mcp.resources.ts",
          "apps/api/src/mcp/mcp.prompts.ts",
          "apps/api/src/mcp/events/events.bridge.ts",
          "docs/adr/0006-nestjs-api-and-mcp.md"
        ],
        "invariant": "The intentional local-process trust of stdio must not silently supply a host-wide or default Project to reads or proposals that require a Project.",
        "method": "source",
        "result": "Stdio starts the same AppModule without the HTTP bearer guard. No stdio bootstrap binds McpProjectContext, and there is no default Project in that context. The real HttpMcpBackend calls require() for daemon and audit reads. proposeFix requires a Project before any backend read, and its audit writer explicitly refuses a missing Project. Resource reads use the same backend. Event list and poll refuse a caller without a Project. Prompts and catalog discovery expose static instructions and metadata under the documented local-process trust. No Projectless stdio path to durable data, collector reads or a successful proposal was found in source.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "mcp-read",
    "priority": 5,
    "priority_reason": "MCP exposes scoped data to agents and crosses from authenticated Project context into daemon source reads.",
    "hardening_notes": [
      "Align the resource permission key in apps/api/src/mcp/mcp.permissions.ts:17 with the registered name Autopsy in apps/api/src/mcp/mcp.resources.ts:16. The inspected installed @nestjs/mcp factory passes the registered name to McpScopeGuard, so the current postmortem key fails closed for authenticated resource calls. A positive-scope HTTP resource case should check that behavior; this is an access failure, not a demonstrated security bypass.",
      "packages/mcp-client/src/reply.ts:48 should compare the single returned resource URI with the requested URI as well as checking text, cardinality and MIME type. Only the caller-selected connection can currently supply that reply, and no separate affected principal or privileged consumer was found, so this remains response-validation hardening."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fwork-items%2Fcontrollers%2Fwork-items.controller.ts%23WorkItemsController::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::ATTACK-CLASSES.md%23Access%20control",
    "canonical_refs": {
      "surface": "apps/api/src/work-items/controllers/work-items.controller.ts#WorkItemsController",
      "boundary": "apps/api/src/internal/project-grant.ts#ProjectGrant",
      "subsystem": "apps/api/src/work-items",
      "attack_class": "ATTACK-CLASSES.md#Access control"
    },
    "surface": "Work item, Deployment, Haunting, Audit, and private durable-state routes",
    "boundary": "Bound Project callers and daemon commands to durable Project data and fix lifecycle",
    "subsystem": "apps/api/src/work-items",
    "attack_class": "Work read and fix-trigger scope access",
    "starting_paths": [
      "apps/api/src/work-items",
      "apps/api/src/fix",
      "apps/api/src/deploys",
      "apps/api/src/hauntings",
      "apps/api/src/audit",
      "apps/api/src/internal",
      "apps/api/prisma"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/work-items; this unit covers Work read and fix-trigger scope access."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-data-work",
    "reviewed_paths": [
      "apps/api/src/work-items/controllers/work-items.controller.ts",
      "apps/api/src/auth/oauth-client-credentials.strategy.ts",
      "apps/api/src/auth/oauth-principal.ts",
      "apps/api/src/auth/scopes.ts",
      "apps/api/src/work-items/incidents-read-scope.guard.ts",
      "apps/api/src/work-items/fix-trigger-scope.guard.ts",
      "apps/api/src/app.factory.ts",
      "apps/api/src/work-items/dto/list-work-items-query.dto.ts",
      "apps/api/src/work-items/dto/triage-request.dto.ts",
      "apps/api/src/work-items/dto/fix-now-request.dto.ts",
      "apps/api/src/work-items/dto/answer-request.dto.ts",
      "apps/api/src/work-items/dto/work-value.ts",
      "apps/api/src/work-items/work-items.module.ts",
      "apps/api/src/audit/audit-scope.interceptor.ts",
      "apps/api/src/fix/audited-work.commands.ts",
      "apps/api/src/fix/fix.audit.ts",
      "packages/work/src/routing-summary.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/work-items/controllers/work-items.controller.ts",
          "apps/api/src/auth/oauth-client-credentials.strategy.ts",
          "apps/api/src/auth/oauth-principal.ts",
          "apps/api/src/auth/scopes.ts",
          "apps/api/src/work-items/incidents-read-scope.guard.ts",
          "apps/api/src/work-items/fix-trigger-scope.guard.ts"
        ],
        "invariant": "Authentication alone must not authorize Work reads, triage, Fix now or answers; caller identity and Project must come from the verified principal.",
        "method": "source",
        "result": "All six public Work methods use the management OAuth strategy, which pins HS256, issuer and audience, checks the current stored client's Project and grants, and requires tokens:manage. List/get/routing additionally require incidents:read. Triage/fix-now/answer additionally require fix:trigger. The controller constructs projectId and actor from request.user and never takes either from a public body. fix:trigger is absent from console-client and Credential issuance catalogs. One-way alias expansion does not add fix:trigger or incidents:read to a canonical scope.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/app.factory.ts",
          "apps/api/src/work-items/dto/list-work-items-query.dto.ts",
          "apps/api/src/work-items/dto/triage-request.dto.ts",
          "apps/api/src/work-items/dto/fix-now-request.dto.ts",
          "apps/api/src/work-items/dto/answer-request.dto.ts",
          "apps/api/src/work-items/dto/work-value.ts",
          "packages/work/src/routing-summary.ts"
        ],
        "invariant": "Public selectors and command bodies cannot replace the principal's Project, actor, worker, attempt fence or repository policy.",
        "method": "source",
        "result": "The global ValidationPipe transforms DTOs and rejects undeclared fields. The list DTO accepts only bounded paging and named filters; it has no projectId field to override the repository's Project predicate. Command DTOs expose assignee, note, or a schema-checked answer only. The routing projection returns the saved question and attempt summary without returning Agent params or saved request text. No alternate bulk/import mutation route was found in the assigned controllers.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/work-items/work-items.module.ts",
          "apps/api/src/audit/audit-scope.interceptor.ts",
          "apps/api/src/fix/audited-work.commands.ts",
          "apps/api/src/fix/fix.audit.ts"
        ],
        "invariant": "Every public Fix command must use the audited boundary and match the authenticated Project and actor before crossing to the daemon.",
        "method": "source",
        "result": "WORK_COMMANDS resolves to AuditedWorkCommands. Each mutation calls requireFixAuditScope before the inner transport; that function rejects missing/blank scope and mismatched Project or actor. AuditScopeInterceptor binds its immutable request-local scope from the authenticated principal. Controllers do not inject the inner transport directly. Missing audit acknowledgment withholds a returned result.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "data-work",
    "priority": 4,
    "priority_reason": "Public and internal state paths carry tenant isolation, durable authorization, and irreversible publication state.",
    "hardening_notes": [
      "Add a source regression spanning an initial awaiting_answer or publication_uncertain reply and its later answer/reconciliation through AuditedWorkCommands. fix.audit.ts:62 keys fix.outcome only by attempt/trigger, while AuditRepo rejects different facts under the same key. The later lifecycle result changes those facts, so review whether nonterminal replies should use a separate transition key or defer the terminal outcome entry. This is a response/audit-lifecycle correctness concern here: pre-effect intent and durable Work transition audit remain present, and no unauthorized effect was established.",
      "Exercise the actual identity-migration runner with overlapping old numeric IDs, a failure after trigger removal, and retry, rather than proving rollback only by wrapping the extracted SQL block in a test-owned transaction. Keep this as a migration-coverage task until an affected unauthorized principal/resource is established.",
      "Make DeployRepo.list require an explicit Project selector, or expose an explicit separate privileged enumeration operation. Current Deployment routes always pass a verified route Project, so the optional unfiltered repository form is not a current access-control finding."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fwork-items%2Fcontrollers%2Fwork-items.controller.ts%23WorkItemsController::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::DATA-ISOLATION-AND-LIFECYCLE.md%23Composite-key%20and%20namespace%20collision",
    "canonical_refs": {
      "surface": "apps/api/src/work-items/controllers/work-items.controller.ts#WorkItemsController",
      "boundary": "apps/api/src/internal/project-grant.ts#ProjectGrant",
      "subsystem": "apps/api/src/work-items",
      "attack_class": "DATA-ISOLATION-AND-LIFECYCLE.md#Composite-key and namespace collision"
    },
    "surface": "Work item, Deployment, Haunting, Audit, and private durable-state routes",
    "boundary": "Bound Project callers and daemon commands to durable Project data and fix lifecycle",
    "subsystem": "apps/api/src/work-items",
    "attack_class": "Command and work namespace collision",
    "starting_paths": [
      "apps/api/src/work-items",
      "apps/api/src/fix",
      "apps/api/src/deploys",
      "apps/api/src/hauntings",
      "apps/api/src/audit",
      "apps/api/src/internal",
      "apps/api/prisma"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "DATA-ISOLATION-AND-LIFECYCLE.md#Core discipline",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Composite-key and namespace collision",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Universal moves",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/work-items; this unit covers Command and work namespace collision."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-data-work",
    "reviewed_paths": [
      "apps/api/prisma/schema.prisma",
      "apps/api/src/work-items/work-haunting.mapper.ts",
      "apps/api/src/work-items/work-item.repo.ts",
      "apps/api/src/work-items/work-item.state.ts",
      "apps/api/src/work-items/work-item.mapper.ts",
      "apps/api/src/work-items/work-item.receipts.ts",
      "apps/api/src/work-items/work-command-id.pipe.ts",
      "apps/api/src/audit/audit.repo.ts",
      "apps/api/src/audit/audit.mapper.ts",
      "apps/api/src/fix/fix.audit.ts",
      "apps/api/src/hauntings/haunting.repo.ts",
      "apps/api/src/deploys/deploy.repo.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/prisma/schema.prisma",
          "apps/api/src/work-items/work-haunting.mapper.ts",
          "apps/api/src/work-items/work-item.repo.ts"
        ],
        "invariant": "Identical incident IDs in different Projects cannot select or create the same current Work item, and relationships cannot cross Projects.",
        "method": "source",
        "result": "Current Haunting ingress derives the Work ID from SHA-256 of JSON.stringify([projectId, incidentId]), avoiding delimiter ambiguity and including the Project even though WorkItem.id is globally unique. Lookups still include projectId. FixAttempt and WorkCommand relationships reference the composite [projectId, workItemId] key. Hauntings, Audit entries, command receipts and Deployment buckets have Project-qualified primary or unique keys. A caller cannot provide a replacement Work ID to the ingress DTO.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/work-items/work-item.repo.ts",
          "apps/api/src/work-items/work-item.state.ts",
          "apps/api/src/work-items/work-item.mapper.ts",
          "apps/api/src/work-items/work-item.receipts.ts",
          "apps/api/src/work-items/work-command-id.pipe.ts"
        ],
        "invariant": "An Idempotency-Key cannot retrieve another actor's result, collide across Projects, or be reused for a different Work item or request.",
        "method": "source",
        "result": "Receipt keys and command advisory locks include projectId. commandReceipt also checks workItemId, actor and the canonical request hash before exposing a result. The hash includes Project, actor, expectedVersion, Work ID, kind and body. Public command IDs are bounded and restricted to an ASCII token format. recordResult qualifies related receipts by Project, Work ID and attempt ID before updating their Project-qualified keys. Same-Project key reuse by another actor produces a conflict instead of disclosing the prior result.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/audit/audit.repo.ts",
          "apps/api/src/audit/audit.mapper.ts",
          "apps/api/src/fix/fix.audit.ts",
          "apps/api/src/hauntings/haunting.repo.ts",
          "apps/api/src/deploys/deploy.repo.ts"
        ],
        "invariant": "Audit deduplication and Deployment identity must not let one Project overwrite or suppress another Project's durable facts.",
        "method": "source",
        "result": "Audit dedup uses [projectId, eventKey] and a Project advisory lock; a repeated key with different canonical actor/type/incident/payload facts throws AuditConflict. Haunting event keys are resolved within that same Project chain. Fix outcome keys distinguish attempts from the command fallback namespace. Deployment lookups and the unique constraint include Project, SHA and Environment; redeploys return the original row and do not overwrite it. No cross-Project collision path survived these controls.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "data-work",
    "priority": 4,
    "priority_reason": "Public and internal state paths carry tenant isolation, durable authorization, and irreversible publication state.",
    "hardening_notes": [
      "Add a source regression spanning an initial awaiting_answer or publication_uncertain reply and its later answer/reconciliation through AuditedWorkCommands. fix.audit.ts:62 keys fix.outcome only by attempt/trigger, while AuditRepo rejects different facts under the same key. The later lifecycle result changes those facts, so review whether nonterminal replies should use a separate transition key or defer the terminal outcome entry. This is a response/audit-lifecycle correctness concern here: pre-effect intent and durable Work transition audit remain present, and no unauthorized effect was established.",
      "Exercise the actual identity-migration runner with overlapping old numeric IDs, a failure after trigger removal, and retry, rather than proving rollback only by wrapping the extracted SQL block in a test-owned transaction. Keep this as a migration-coverage task until an affected unauthorized principal/resource is established.",
      "Make DeployRepo.list require an explicit Project selector, or expose an explicit separate privileged enumeration operation. Current Deployment routes always pass a verified route Project, so the optional unfiltered repository form is not a current access-control finding."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fwork-items%2Fcontrollers%2Fwork-items.controller.ts%23WorkItemsController::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::DATA-ISOLATION-AND-LIFECYCLE.md%23Missing%20tenant%20or%20owner%20enforcement",
    "canonical_refs": {
      "surface": "apps/api/src/work-items/controllers/work-items.controller.ts#WorkItemsController",
      "boundary": "apps/api/src/internal/project-grant.ts#ProjectGrant",
      "subsystem": "apps/api/src/work-items",
      "attack_class": "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement"
    },
    "surface": "Work item, Deployment, Haunting, Audit, and private durable-state routes",
    "boundary": "Bound Project callers and daemon commands to durable Project data and fix lifecycle",
    "subsystem": "apps/api/src/work-items",
    "attack_class": "Durable Project read and write isolation",
    "starting_paths": [
      "apps/api/src/work-items",
      "apps/api/src/fix",
      "apps/api/src/deploys",
      "apps/api/src/hauntings",
      "apps/api/src/audit",
      "apps/api/src/internal",
      "apps/api/prisma"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "DATA-ISOLATION-AND-LIFECYCLE.md#Core discipline",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Missing tenant or owner enforcement",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Universal moves",
      "DATA-ISOLATION-AND-LIFECYCLE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Business logic",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/work-items; this unit covers Durable Project read and write isolation."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-data-work",
    "reviewed_paths": [
      "apps/api/src/internal/internal.guard.ts",
      "apps/api/src/internal/project-grant.ts",
      "apps/api/src/work-items/controllers/internal-work.controller.ts",
      "apps/api/src/work-items/controllers/work-ingress.controller.ts",
      "apps/api/src/work-items/dto/internal-work.dto.ts",
      "apps/api/src/work-items/work-ingress.service.ts",
      "apps/api/src/work-items/work-item.repo.ts",
      "apps/api/src/work-items/work-item.state.ts",
      "apps/api/src/hauntings/haunting.controller.ts",
      "apps/api/src/hauntings/haunting.service.ts",
      "apps/api/src/hauntings/haunting.repo.ts",
      "packages/core/src/recorded.ts",
      "apps/api/src/audit/audit.controller.ts",
      "apps/api/src/audit/audit.repo.ts",
      "apps/api/src/audit/audit.usage.ts",
      "apps/api/src/internal/policy-context.service.ts",
      "apps/api/src/deploys/deploys.controller.ts",
      "apps/api/src/deploys/guards/deploy-auth.guard.ts",
      "apps/api/src/deploys/deploys.service.ts",
      "apps/api/src/deploys/deploy.types.ts",
      "apps/api/src/deploys/deploy.repo.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/internal/internal.guard.ts",
          "apps/api/src/internal/project-grant.ts",
          "apps/api/src/work-items/controllers/internal-work.controller.ts",
          "apps/api/src/work-items/controllers/work-ingress.controller.ts",
          "apps/api/src/work-items/dto/internal-work.dto.ts",
          "apps/api/src/work-items/work-ingress.service.ts",
          "apps/api/src/work-items/work-item.repo.ts",
          "apps/api/src/work-items/work-item.state.ts"
        ],
        "invariant": "Private durable-state access needs the internal principal and a stored Project grant, and every Work/attempt/receipt query or mutation must retain that Project.",
        "method": "source",
        "result": "Both private Work controllers require InternalGuard's bearer token. WorkItemRepo checks ProjectGrant on reads, replays, creation, counts and every change; the grant denies missing, nonnumeric and unlisted Projects. loadWork binds Work ID plus Project, then binds the active attempt to that Project and Work item. Both mutation fences and all receipt operations include Project. Ingress resolves the Haunting inside input.projectId and ignores caller-supplied Work content. Nested internal DTOs use strict canonical schemas. The internal token represents the configured integration over its stored grant set; no per-Organization account identity was assumed for that trusted integration.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/hauntings/haunting.controller.ts",
          "apps/api/src/hauntings/haunting.service.ts",
          "apps/api/src/hauntings/haunting.repo.ts",
          "packages/core/src/recorded.ts",
          "apps/api/src/internal/project-grant.ts"
        ],
        "invariant": "Haunting list/get/context/active/upsert paths cannot access another Project or persist foreign Detection ownership.",
        "method": "source",
        "result": "Internal authentication precedes HauntingService, which checks the Project grant for every operation. Each repository read has a Project predicate and upsert uses [projectId, incidentId]. Upsert rejects any Detection whose Project differs from the call; the recorded schema also binds each Detection's service and the Diagnosis's incident ID. Derived Diagnosis context queries require Project, service and diagnosisRef together. Sanitized material remains under the same Project-qualified durable record and audit chain.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/audit/audit.controller.ts",
          "apps/api/src/audit/audit.repo.ts",
          "apps/api/src/audit/audit.usage.ts",
          "apps/api/src/internal/policy-context.service.ts"
        ],
        "invariant": "Audit writes and policy counters must not consume another Project's chain, Diagnosis or publication state.",
        "method": "source",
        "result": "The private audit append endpoint requires InternalGuard and checks the requested stored Project grant. Audit list, verification and every usage-query subquery include Project. PolicyContextService checks the grant, resolves the Diagnosis in that Project, verifies its service, and requests audit/publication counters for that same Project. SQL parameters are bound. Unknown or malformed usage facts fail closed instead of supplying zero counters.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/deploys/deploys.controller.ts",
          "apps/api/src/deploys/guards/deploy-auth.guard.ts",
          "apps/api/src/deploys/deploys.service.ts",
          "apps/api/src/deploys/deploy.types.ts",
          "apps/api/src/deploys/deploy.repo.ts"
        ],
        "invariant": "Deployment route selectors must bind to the caller Organization and permitted Project, including org-wide readers and writers.",
        "method": "source",
        "result": "DeployAuthGuard verifies the current OAuth principal, requires a route scope, matches the route Organization to the stored client, verifies the route Project's Organization, and restricts bound clients unless an explicit org-wide scope applies. Creation repeats the Project ownership check and allows cross-Project writes only for org:ci; org:read alone cannot widen a project:write grant. Lists always pass the validated route Project to the repository, even for org-wide readers. Existing Deployment lookup and creation use that Project, SHA and Environment. No caller reaches DeployRepo.list's optional unfiltered form through these routes.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "data-work",
    "priority": 4,
    "priority_reason": "Public and internal state paths carry tenant isolation, durable authorization, and irreversible publication state.",
    "hardening_notes": [
      "Add a source regression spanning an initial awaiting_answer or publication_uncertain reply and its later answer/reconciliation through AuditedWorkCommands. fix.audit.ts:62 keys fix.outcome only by attempt/trigger, while AuditRepo rejects different facts under the same key. The later lifecycle result changes those facts, so review whether nonterminal replies should use a separate transition key or defer the terminal outcome entry. This is a response/audit-lifecycle correctness concern here: pre-effect intent and durable Work transition audit remain present, and no unauthorized effect was established.",
      "Exercise the actual identity-migration runner with overlapping old numeric IDs, a failure after trigger removal, and retry, rather than proving rollback only by wrapping the extracted SQL block in a test-owned transaction. Keep this as a migration-coverage task until an affected unauthorized principal/resource is established.",
      "Make DeployRepo.list require an explicit Project selector, or expose an explicit separate privileged enumeration operation. Current Deployment routes always pass a verified route Project, so the optional unfiltered repository form is not a current access-control finding."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fwork-items%2Fcontrollers%2Fwork-items.controller.ts%23WorkItemsController::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::PROTOCOLS-RPC-AND-MESSAGING.md%23Acknowledgment%2Fcommit%20ordering%20defects",
    "canonical_refs": {
      "surface": "apps/api/src/work-items/controllers/work-items.controller.ts#WorkItemsController",
      "boundary": "apps/api/src/internal/project-grant.ts#ProjectGrant",
      "subsystem": "apps/api/src/work-items",
      "attack_class": "PROTOCOLS-RPC-AND-MESSAGING.md#Acknowledgment/commit ordering defects"
    },
    "surface": "Work item, Deployment, Haunting, Audit, and private durable-state routes",
    "boundary": "Bound Project callers and daemon commands to durable Project data and fix lifecycle",
    "subsystem": "apps/api/src/work-items",
    "attack_class": "Audit and Deployment integrity handoffs",
    "starting_paths": [
      "apps/api/src/work-items",
      "apps/api/src/fix",
      "apps/api/src/deploys",
      "apps/api/src/hauntings",
      "apps/api/src/audit",
      "apps/api/src/internal",
      "apps/api/prisma"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
    "selected_companion_blocks": [
      "PROTOCOLS-RPC-AND-MESSAGING.md#Core discipline",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Acknowledgment/commit ordering defects",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Universal moves",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/work-items; this unit covers Audit and Deployment integrity handoffs."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-data-work",
    "reviewed_paths": [
      "apps/api/src/audit/audit.repo.ts",
      "apps/api/src/audit/audit.transaction.ts",
      "apps/api/prisma/migrations/20261121052714_init/migration.sql",
      "apps/api/prisma/migrations/20261122120000_v3_deployments/migration.sql",
      "apps/api/src/work-items/work-item.repo.ts",
      "apps/api/src/work-items/work-item.admission.ts",
      "apps/api/src/work-items/work-item.questions.ts",
      "apps/api/src/work-items/work-item.publication.ts",
      "apps/api/src/work-items/work-item.recovery.ts",
      "apps/api/src/hauntings/haunting.repo.ts",
      "apps/api/src/hauntings/haunting.service.ts",
      "apps/api/src/deploys/deploy.repo.ts",
      "apps/api/src/deploys/deployment-closure.ts",
      "apps/api/src/fix/audited-work.commands.ts",
      "apps/daemon/src/publication.ts",
      "apps/daemon/src/recovery.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/audit/audit.repo.ts",
          "apps/api/src/audit/audit.transaction.ts",
          "apps/api/prisma/migrations/20261121052714_init/migration.sql",
          "apps/api/src/work-items/work-item.repo.ts",
          "apps/api/src/work-items/work-item.admission.ts",
          "apps/api/src/work-items/work-item.questions.ts",
          "apps/api/src/work-items/work-item.publication.ts",
          "apps/api/src/work-items/work-item.recovery.ts"
        ],
        "invariant": "A returned durable Work transition must commit its receipt, version fence and required audit facts together; transaction retries must not repeat external effects.",
        "method": "source",
        "result": "Creation, triage, claim, saved question, applied answer, publication admission, completion, abandon and publication abort await appendInTx inside the same serializable transaction as their durable state. AuditRepo serializes each Project chain, checks dedup facts and appends the next chained entry. The retry helper reruns database-only callbacks for serialization/AuditEntry uniqueness conflicts. Heartbeats intentionally renew only execution ownership and do not represent a new privileged effect. Database triggers reject audit UPDATE and DELETE outside the migration rewrite.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/hauntings/haunting.repo.ts",
          "apps/api/src/hauntings/haunting.service.ts",
          "apps/api/src/deploys/deploy.repo.ts",
          "apps/api/src/deploys/deployment-closure.ts",
          "apps/api/prisma/migrations/20261122120000_v3_deployments/migration.sql"
        ],
        "invariant": "Haunting acknowledgment and Deployment closure must not lose or duplicate a security-relevant transition after a partial handoff failure.",
        "method": "source",
        "result": "Haunting audit append and materialized upsert share a transaction. HauntingService awaits the separate closure before returning. A retry after closure failure reaches the existing Haunting and reapplies the idempotent closeFirst transition. closeFirst updates only an unclosed row matching Project/SHA/Environment and appends its closure audit in the same transaction; creation likewise commits row and audit together. The saved opening pair cannot be moved by a later Event from another Environment. Deployment triggers forbid all other updates and all deletion.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/work-items/work-item.repo.ts",
          "apps/api/src/work-items/work-item.publication.ts",
          "apps/api/src/fix/audited-work.commands.ts",
          "apps/daemon/src/publication.ts",
          "apps/daemon/src/recovery.ts"
        ],
        "invariant": "A draft publication needs acknowledged pre-effect audit and durable intent, while a known remote reference must survive a later audit or response failure.",
        "method": "source",
        "result": "publishFix awaits fix.pr_intent audit and the committed beginPublication response before calling prepared.publish. recordPublication first commits the matching known PR into both Work and attempt state, then performs the later audit handoff. A later audit failure cannot roll back that known reference. Completion validates the reference against saved publication state. Error/replay paths retain the intent, reconcile it before completion and do not call a second publisher. AuditedWorkCommands withholds the final HTTP result on an outcome-audit error. The separate immutable-key outcome concern is recorded as hardening, without claiming an unaudited privileged effect.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "data-work",
    "priority": 4,
    "priority_reason": "Public and internal state paths carry tenant isolation, durable authorization, and irreversible publication state.",
    "hardening_notes": [
      "Add a source regression spanning an initial awaiting_answer or publication_uncertain reply and its later answer/reconciliation through AuditedWorkCommands. fix.audit.ts:62 keys fix.outcome only by attempt/trigger, while AuditRepo rejects different facts under the same key. The later lifecycle result changes those facts, so review whether nonterminal replies should use a separate transition key or defer the terminal outcome entry. This is a response/audit-lifecycle correctness concern here: pre-effect intent and durable Work transition audit remain present, and no unauthorized effect was established.",
      "Exercise the actual identity-migration runner with overlapping old numeric IDs, a failure after trigger removal, and retry, rather than proving rollback only by wrapping the extracted SQL block in a test-owned transaction. Keep this as a migration-coverage task until an affected unauthorized principal/resource is established.",
      "Make DeployRepo.list require an explicit Project selector, or expose an explicit separate privileged enumeration operation. Current Deployment routes always pass a verified route Project, so the optional unfiltered repository form is not a current access-control finding."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fwork-items%2Fcontrollers%2Fwork-items.controller.ts%23WorkItemsController::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::PROTOCOLS-RPC-AND-MESSAGING.md%23Duplicate%20delivery%20and%20idempotency%20gaps",
    "canonical_refs": {
      "surface": "apps/api/src/work-items/controllers/work-items.controller.ts#WorkItemsController",
      "boundary": "apps/api/src/internal/project-grant.ts#ProjectGrant",
      "subsystem": "apps/api/src/work-items",
      "attack_class": "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps"
    },
    "surface": "Work item, Deployment, Haunting, Audit, and private durable-state routes",
    "boundary": "Bound Project callers and daemon commands to durable Project data and fix lifecycle",
    "subsystem": "apps/api/src/work-items",
    "attack_class": "Fix command replay and idempotent effects",
    "starting_paths": [
      "apps/api/src/work-items",
      "apps/api/src/fix",
      "apps/api/src/deploys",
      "apps/api/src/hauntings",
      "apps/api/src/audit",
      "apps/api/src/internal",
      "apps/api/prisma"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "PROTOCOLS-RPC-AND-MESSAGING.md#Core discipline",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Universal moves",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/work-items; this unit covers Fix command replay and idempotent effects."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-data-work",
    "reviewed_paths": [
      "apps/api/src/work-items/work-item.repo.ts",
      "apps/api/src/work-items/work-item.state.ts",
      "apps/api/src/work-items/work-item.admission.ts",
      "apps/api/src/work-items/work-item.questions.ts",
      "apps/api/src/work-items/work-item.receipts.ts",
      "apps/api/src/work-items/work-ingress.service.ts",
      "apps/api/src/hauntings/haunting.repo.ts",
      "apps/api/src/hauntings/haunting.mapper.ts",
      "apps/api/src/audit/audit.repo.ts",
      "apps/api/src/deploys/deploys.service.ts",
      "apps/api/src/deploys/deploy.repo.ts",
      "apps/api/src/fix/daemon-work.client.ts",
      "apps/daemon/src/work-flow.ts",
      "apps/daemon/src/publication.ts",
      "apps/daemon/src/recovery.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/work-items/work-item.repo.ts",
          "apps/api/src/work-items/work-item.state.ts",
          "apps/api/src/work-items/work-item.admission.ts",
          "apps/api/src/work-items/work-item.questions.ts",
          "apps/api/src/work-items/work-item.receipts.ts"
        ],
        "invariant": "Repeated or competing command delivery cannot admit another active attempt or reuse a saved question twice.",
        "method": "source",
        "result": "Each change locks the Project/command namespace in a serializable transaction. A matching receipt replays its result or reports COMMAND_IN_PROGRESS; content/actor/item disagreement conflicts. Claims fence the Work version and activeAttemptId before inserting an attempt. A saved triage receipt also requires its saved version. Answer application creates its receipt in the transition transaction and accepts only the current awaiting_answer attempt/question/version; different answer commands race on the same Work and attempt fences. recordResult updates all receipts for that specific Project/Work/attempt so replay returns durable state.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/work-items/work-ingress.service.ts",
          "apps/api/src/work-items/work-item.repo.ts",
          "apps/api/src/hauntings/haunting.repo.ts",
          "apps/api/src/hauntings/haunting.mapper.ts",
          "apps/api/src/audit/audit.repo.ts",
          "apps/api/src/deploys/deploys.service.ts",
          "apps/api/src/deploys/deploy.repo.ts"
        ],
        "invariant": "Redelivered Haunting creation/updates and Deployment registration cannot overwrite prior assignment or multiply the same durable operation.",
        "method": "source",
        "result": "Ingress returns existing Work before deriving any replacement content; createMany with skipDuplicates and a deterministic Project-bound ID converges competing creation. Only a newly inserted Work row gets work.created audit. Haunting event-key dedup is Project-local and its applied audit sequence prevents an older acknowledged delivery from overwriting a newer view. Deployment registration checks the Project/SHA/Environment key, recovers the unique-key winner on concurrent insertion, and returns the stored immutable row without another audit entry.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/fix/daemon-work.client.ts",
          "apps/daemon/src/work-flow.ts",
          "apps/daemon/src/publication.ts",
          "apps/daemon/src/recovery.ts"
        ],
        "invariant": "A transport retry after a lost publication response must reconcile saved intent rather than invoke a second remote publication.",
        "method": "source",
        "result": "The API transport disables automatic retry and tells the caller to reuse its command ID. Every daemon command consults replayWork before admission. Publishing/uncertain attempts retain an intent and block a fresh claim. Replay recovery reads known publication or calls the recovery lookup, records the matched repo/branch reference and finishes the existing attempt; it contains no publication call. Expired pre-publication work may be abandoned only before an intent exists. No duplicate remote-write path survived the source-visible receipt and intent controls.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "data-work",
    "priority": 4,
    "priority_reason": "Public and internal state paths carry tenant isolation, durable authorization, and irreversible publication state.",
    "hardening_notes": [
      "Add a source regression spanning an initial awaiting_answer or publication_uncertain reply and its later answer/reconciliation through AuditedWorkCommands. fix.audit.ts:62 keys fix.outcome only by attempt/trigger, while AuditRepo rejects different facts under the same key. The later lifecycle result changes those facts, so review whether nonterminal replies should use a separate transition key or defer the terminal outcome entry. This is a response/audit-lifecycle correctness concern here: pre-effect intent and durable Work transition audit remain present, and no unauthorized effect was established.",
      "Exercise the actual identity-migration runner with overlapping old numeric IDs, a failure after trigger removal, and retry, rather than proving rollback only by wrapping the extracted SQL block in a test-owned transaction. Keep this as a migration-coverage task until an affected unauthorized principal/resource is established.",
      "Make DeployRepo.list require an explicit Project selector, or expose an explicit separate privileged enumeration operation. Current Deployment routes always pass a verified route Project, so the optional unfiltered repository form is not a current access-control finding."
    ]
  },
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fwork-items%2Fcontrollers%2Fwork-items.controller.ts%23WorkItemsController::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::PROTOCOLS-RPC-AND-MESSAGING.md%23Out-of-order%20and%20stale%20message%20acceptance",
    "canonical_refs": {
      "surface": "apps/api/src/work-items/controllers/work-items.controller.ts#WorkItemsController",
      "boundary": "apps/api/src/internal/project-grant.ts#ProjectGrant",
      "subsystem": "apps/api/src/work-items",
      "attack_class": "PROTOCOLS-RPC-AND-MESSAGING.md#Out-of-order and stale message acceptance"
    },
    "surface": "Work item, Deployment, Haunting, Audit, and private durable-state routes",
    "boundary": "Bound Project callers and daemon commands to durable Project data and fix lifecycle",
    "subsystem": "apps/api/src/work-items",
    "attack_class": "Fix claim, lease, answer, publication and recovery transitions",
    "starting_paths": [
      "apps/api/src/work-items",
      "apps/api/src/fix",
      "apps/api/src/deploys",
      "apps/api/src/hauntings",
      "apps/api/src/audit",
      "apps/api/src/internal",
      "apps/api/prisma"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "PROTOCOLS-RPC-AND-MESSAGING.md#Core discipline",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Out-of-order and stale message acceptance",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Universal moves",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/work-items; this unit covers Fix claim, lease, answer, publication and recovery transitions."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-data-work",
    "reviewed_paths": [
      "apps/api/src/work-items/controllers/work-items.controller.ts",
      "apps/api/src/work-items/fix-trigger-scope.guard.ts",
      "apps/api/src/work-items/work-item.state.ts",
      "apps/api/src/work-items/work-item.lease.ts",
      "apps/api/src/work-items/work-item.questions.ts",
      "apps/api/src/work-items/work-item.publication.ts",
      "apps/api/src/work-items/work-item.recovery.ts",
      "apps/api/src/work-items/work-item.repo.ts",
      "apps/api/src/internal/policy-context.service.ts",
      "apps/api/src/hauntings/haunting.repo.ts",
      "packages/work/src/decisions.ts",
      "packages/policy/src/evaluation.ts",
      "packages/policy/src/decide.ts",
      "packages/policy/src/schema.ts",
      "apps/daemon/src/work-flow.ts",
      "apps/daemon/src/fix-context.ts",
      "apps/daemon/src/run-fix.ts",
      "apps/daemon/src/publication.ts",
      "apps/daemon/src/recovery.ts",
      "apps/daemon/src/attempt-lifetime.ts",
      "apps/daemon/src/command-lifetime.ts",
      "apps/daemon/src/command-handler.ts",
      "apps/daemon/src/main.ts",
      "apps/api/src/work-items/work-counter.database.spec.ts",
      "docs/adr/0008-fix-paths-and-safety.md"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/work-items/work-item.state.ts",
          "apps/api/src/work-items/work-item.lease.ts",
          "apps/api/src/work-items/work-item.questions.ts",
          "apps/api/src/work-items/work-item.publication.ts",
          "apps/api/src/work-items/work-item.recovery.ts",
          "apps/daemon/src/attempt-lifetime.ts",
          "apps/daemon/src/recovery.ts"
        ],
        "invariant": "A stale worker, expired lease, obsolete attempt fence or old question cannot advance the current Work attempt or replace a known publication.",
        "method": "source",
        "result": "activeAttempt checks Work version, active attempt ID, attempt version and allowed state. Mutation fences repeat Project, Work, status/state, version and worker predicates. Pre-publication state changes require the database-clock lease to be live. Heartbeat renews only the same active worker and live attempt; abandon requires an expired claimed/running attempt with no publication. Publication recovery changes workers only after expiry, retains repo/branch/baseSha identity, rejects replacing a known PR and fences the transfer. Saved questions lose execution ownership, and a complete answer creates a fresh lease for the same attempt and trigger. No stale-worker overwrite bypass was established.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/work-items/work-item.questions.ts",
          "apps/api/src/hauntings/haunting.repo.ts",
          "packages/work/src/decisions.ts",
          "apps/daemon/src/work-flow.ts"
        ],
        "invariant": "Resuming a question or accepting an older incident view must retain the selected Agent, current eligibility and immutable incident identity.",
        "method": "source",
        "result": "The daemon rechecks assignment and trigger eligibility before applyAnswer. Durable answer handling requires the saved attempt/question/version, accepts declared Agent params only, and hands incomplete answers to a Human. It does not select another Agent. Haunting writes reject a changed service/opening time or an older updatedAt; acknowledged older audit sequence is ignored. These source-visible controls settle the assigned same-record ordering paths.",
        "artifact": null
      },
      {
        "agent_id": "hunt-data-work",
        "reviewed_paths": [
          "apps/api/src/work-items/controllers/work-items.controller.ts",
          "apps/api/src/work-items/fix-trigger-scope.guard.ts",
          "apps/api/src/work-items/work-item.repo.ts",
          "apps/api/src/work-items/work-item.publication.ts",
          "apps/api/src/internal/policy-context.service.ts",
          "packages/policy/src/evaluation.ts",
          "packages/policy/src/decide.ts",
          "packages/policy/src/schema.ts",
          "apps/daemon/src/work-flow.ts",
          "apps/daemon/src/fix-context.ts",
          "apps/daemon/src/run-fix.ts",
          "apps/daemon/src/publication.ts",
          "apps/daemon/src/command-lifetime.ts",
          "apps/daemon/src/command-handler.ts",
          "apps/daemon/src/main.ts",
          "apps/api/src/work-items/work-counter.database.spec.ts",
          "docs/adr/0008-fix-paths-and-safety.md"
        ],
        "invariant": "A Project's maxOpenPrsPerHour policy must still hold when distinct Work attempts publish after reading the same earlier counter.",
        "method": "source",
        "result": "The real command handler and drain wrapper permit concurrent commands. PolicyContextService returns WorkItemRepo.publicationCount, which excludes claimed/running attempts until their publication becomes non-null. runOwnedFix evaluates the counter once before routing and patch preparation. beginPublication later validates the individual Work/attempt/lease and saves its intent, but never reads or reserves the shared Project cap; its serializable transaction cannot protect the earlier counter read. Distinct commands have distinct command locks and Work fences. The inspected counter test explicitly expects zero after claim and one only after beginPublication. This leaves a source-grounded stale-policy admission candidate for two different Work items; no race fixture or publisher was executed.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "apps/api/src/work-items/work-item.publication.ts:beginPublication/project-pr-limit"
    ],
    "unresolved": [
      "A deterministic local check must establish whether two distinct eligible Work items in one Project can both cross publication admission under maxOpenPrsPerHour=1 after both read the counter as zero. Target execution is prohibited because complete memory and cumulative disk sandbox controls are unavailable; the promotion allowlist is empty. No behavioral result or severity is claimed."
    ],
    "assignment_group": "data-work",
    "priority": 4,
    "priority_reason": "Public and internal state paths carry tenant isolation, durable authorization, and irreversible publication state.",
    "hardening_notes": [
      "Add a source regression spanning an initial awaiting_answer or publication_uncertain reply and its later answer/reconciliation through AuditedWorkCommands. fix.audit.ts:62 keys fix.outcome only by attempt/trigger, while AuditRepo rejects different facts under the same key. The later lifecycle result changes those facts, so review whether nonterminal replies should use a separate transition key or defer the terminal outcome entry. This is a response/audit-lifecycle correctness concern here: pre-effect intent and durable Work transition audit remain present, and no unauthorized effect was established.",
      "Exercise the actual identity-migration runner with overlapping old numeric IDs, a failure after trigger removal, and retry, rather than proving rollback only by wrapping the extracted SQL block in a test-owned transaction. Keep this as a migration-coverage task until an affected unauthorized principal/resource is established.",
      "Make DeployRepo.list require an explicit Project selector, or expose an explicit separate privileged enumeration operation. Current Deployment routes always pass a verified route Project, so the optional unfiltered repository form is not a current access-control finding."
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::AI-AND-LLM.md%23Tool-argument%20injection%20into%20a%20downstream%20sink",
    "canonical_refs": {
      "surface": "apps/daemon/src/fix-execution.ts#executorFromEnv",
      "boundary": "packages/fixer/src/verify.ts#verifyPatch",
      "subsystem": "packages/fixer",
      "attack_class": "AI-AND-LLM.md#Tool-argument injection into a downstream sink"
    },
    "surface": "Model patch output, Git source snapshots, verification commands and draft publication",
    "boundary": "Model-generated source and untrusted repository data to isolated execution and GitHub write authority",
    "subsystem": "packages/fixer",
    "attack_class": "Model patch arguments into source and publication sinks",
    "starting_paths": [
      "packages/fixer/src",
      "packages/patch/src",
      "apps/daemon/src/fix-execution.ts",
      "apps/daemon/src/run-fix.ts",
      "apps/daemon/src/publication.ts",
      "apps/daemon/src/recovery.ts",
      "apps/daemon/src/attempt-lifetime.ts",
      "apps/daemon/src/cancellable-github.ts",
      "apps/daemon/src/fix-recording.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Injection",
    "selected_companion_blocks": [
      "AI-AND-LLM.md#Core discipline",
      "AI-AND-LLM.md#Tool-argument injection into a downstream sink",
      "AI-AND-LLM.md#Universal moves",
      "AI-AND-LLM.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Resource and file handling",
        "reason": "This distinct ordinary class has a sibling unit in packages/fixer; this unit covers Model patch arguments into source and publication sinks."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-patch-fixer",
    "reviewed_paths": [
      "packages/patch/src/generate.ts",
      "packages/patch/src/schemas.ts",
      "packages/patch/src/guard.ts",
      "packages/fixer/src/source.ts",
      "packages/fixer/src/verify.ts",
      "packages/fixer/src/open-pr.ts",
      "packages/fixer/src/verified-publication.ts",
      "packages/fixer/src/sandbox.ts",
      "packages/fixer/src/branch.ts",
      "packages/fixer/src/outbound.ts",
      "packages/fixer/src/rest.ts",
      "packages/fixer/src/auth.ts",
      "packages/fixer/src/types.ts",
      "apps/daemon/src/fix-execution.ts",
      "apps/daemon/src/publication.ts",
      "apps/daemon/src/fix-context.ts",
      "apps/daemon/src/work-flow.ts",
      "apps/daemon/src/run-fix.ts",
      "apps/daemon/src/main.ts",
      "apps/daemon/src/boot-config.ts",
      "packages/policy/src/schema.ts",
      "packages/policy/src/evaluation.ts",
      "packages/core/src/policy-context.ts",
      "apps/api/src/internal/internal-config.controller.ts",
      "apps/api/src/auth/dto/create-credential.dto.ts",
      "apps/api/src/auth/services/credential.service.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/deploys/deploys.service.ts",
      "apps/api/src/deploys/dto/create-deploy.dto.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "packages/patch/src/generate.ts",
          "packages/patch/src/schemas.ts",
          "packages/patch/src/guard.ts",
          "packages/fixer/src/source.ts",
          "packages/fixer/src/verify.ts",
          "packages/fixer/src/open-pr.ts",
          "packages/fixer/src/verified-publication.ts",
          "packages/fixer/src/sandbox.ts",
          "packages/fixer/src/branch.ts",
          "packages/fixer/src/outbound.ts",
          "packages/fixer/src/rest.ts",
          "packages/fixer/src/auth.ts",
          "apps/daemon/src/fix-execution.ts",
          "apps/daemon/src/publication.ts"
        ],
        "invariant": "Model output can supply only a bounded patch against the selected source; it cannot supply shell syntax, Git metadata, a repository URL, or publication credentials.",
        "method": "source",
        "result": "generatePatch reparses strict output and reruns guardPatch. verifyPatch clones the source, reparses the patch, binds commit and blob identities, rejects unsafe targets, and recalculates actual changes. Git path arguments follow --, Git hooks/fsmonitor/protocols are disabled by the sandbox environment, and configured commands are argv supplied by operator configuration. Repository names are encoded into a fixed HTTPS GitHub API origin with redirects rejected. Branch and outbound text normalization prevent control-character/ref injection. No direct model-to-shell or model-selected external URL bypass was established.",
        "artifact": null
      },
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "packages/fixer/src/types.ts",
          "apps/daemon/src/fix-context.ts",
          "apps/daemon/src/work-flow.ts",
          "apps/daemon/src/run-fix.ts",
          "apps/daemon/src/main.ts",
          "apps/daemon/src/boot-config.ts",
          "packages/policy/src/schema.ts",
          "packages/policy/src/evaluation.ts",
          "packages/core/src/policy-context.ts",
          "apps/api/src/internal/internal-config.controller.ts",
          "apps/api/src/auth/dto/create-credential.dto.ts",
          "apps/api/src/auth/services/credential.service.ts",
          "apps/api/src/auth/services/event-ingest.service.ts",
          "apps/api/src/deploys/deploys.service.ts",
          "apps/api/src/deploys/dto/create-deploy.dto.ts"
        ],
        "invariant": "The Project that owns the Work item must also be authorized for the repository whose source reaches the model and whose GitHub installation publishes its patch.",
        "method": "source",
        "result": "The daemon and durable reads bind caller.projectId, but contextClient selects from one boot-wide policy.github.repos using only snapshot.item.service. RepoPolicy and the policy context have no Project binding. A Project-scoped plugin service is caller-selected, and an own-Project Deployment accepts a syntactically valid SHA without a repository association. The final publication check repeats only the service-to-repo relationship. This leaves a source-grounded Project-to-repository authorization candidate; it does not require bypassing the existing Project guards or assuming prompt injection succeeds.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "daemon/fix-context/service-only-repository-selection"
    ],
    "unresolved": [
      "No bounded two-Project fixture was executed because the assignment prohibits target execution and complete OS-enforced memory and cumulative-disk sandbox controls are unavailable.",
      "The owner must establish whether the shared deployment grants otherwise unrelated Projects and whether the repository policy intentionally grants every such Project access to the same service-named repository."
    ],
    "assignment_group": "patch-fixer",
    "priority": 2,
    "priority_reason": "Source verification executes lower-trust repository material and consumes privileged publication credentials.",
    "hardening_notes": [
      "The verifier installs time, input and stdout bounds but no explicit per-job CPU, memory, process-count or total-disk quotas. Add such controls to contain arbitrary verification code. This source-only review makes no separate OOM, fork-exhaustion or disk-exhaustion finding without a bounded shared-resource observation and review of outer deployment quotas."
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::ATTACK-CLASSES.md%23Business%20logic",
    "canonical_refs": {
      "surface": "apps/daemon/src/fix-execution.ts#executorFromEnv",
      "boundary": "packages/fixer/src/verify.ts#verifyPatch",
      "subsystem": "packages/fixer",
      "attack_class": "ATTACK-CLASSES.md#Business logic"
    },
    "surface": "Model patch output, Git source snapshots, verification commands and draft publication",
    "boundary": "Model-generated source and untrusted repository data to isolated execution and GitHub write authority",
    "subsystem": "packages/fixer",
    "attack_class": "Publication retries and recovery authority",
    "starting_paths": [
      "packages/fixer/src",
      "packages/patch/src",
      "apps/daemon/src/fix-execution.ts",
      "apps/daemon/src/run-fix.ts",
      "apps/daemon/src/publication.ts",
      "apps/daemon/src/recovery.ts",
      "apps/daemon/src/attempt-lifetime.ts",
      "apps/daemon/src/cancellable-github.ts",
      "apps/daemon/src/fix-recording.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Resource and file handling",
        "reason": "This distinct ordinary class has a sibling unit in packages/fixer; this unit covers Publication retries and recovery authority."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-patch-fixer",
    "reviewed_paths": [
      "apps/daemon/src/publication.ts",
      "apps/daemon/src/recovery.ts",
      "apps/daemon/src/attempt-lifetime.ts",
      "apps/daemon/src/cancellable-github.ts",
      "apps/daemon/src/fix-execution.ts",
      "apps/daemon/src/fix-recording.ts",
      "apps/daemon/src/work-flow.ts",
      "apps/daemon/src/fix-audit.ts",
      "packages/work/src/state.ts",
      "packages/work/src/runtime.ts",
      "apps/api/src/work-items/work-item.publication.ts",
      "packages/fixer/src/verified-publication.ts",
      "packages/fixer/src/open-pr.ts",
      "packages/fixer/src/rest.ts",
      "packages/fixer/src/faults.ts",
      "packages/fixer/src/index.ts",
      "apps/daemon/src/recovery.test.ts",
      "apps/daemon/src/publication-failure.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "apps/daemon/src/publication.ts",
          "apps/daemon/src/attempt-lifetime.ts",
          "apps/daemon/src/cancellable-github.ts",
          "apps/daemon/src/fix-execution.ts",
          "apps/daemon/src/fix-recording.ts",
          "apps/daemon/src/work-flow.ts",
          "apps/daemon/src/fix-audit.ts",
          "packages/work/src/runtime.ts",
          "apps/api/src/work-items/work-item.publication.ts",
          "packages/fixer/src/open-pr.ts",
          "packages/fixer/src/faults.ts",
          "packages/fixer/src/index.ts",
          "apps/daemon/src/publication-failure.test.ts"
        ],
        "invariant": "Publication requires durable admission and an owned attempt; uncertain effects block replacement publication, while known references survive transport and optional-label failures.",
        "method": "source",
        "result": "The daemon audits before publication, saves a fenced intent before publish, records a known PR before completion, and preserves uncertain admission after branch/draft failures. API transitions bind Project, command, versions, lease/worker, repository, branch and base; a recorded PrRef cannot be replaced. Replays and answers share replayWork; recovery is read-only against GitHub. The production executor supplies no test runner override; gitChecks is reached from test fixtures only. The production package exports the verified publication path and no merge operation. No duplicate-write or transition bypass was established apart from recovery's weaker object binding.",
        "artifact": null
      },
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "apps/daemon/src/recovery.ts",
          "packages/work/src/state.ts",
          "packages/fixer/src/verified-publication.ts",
          "packages/fixer/src/rest.ts",
          "apps/daemon/src/recovery.test.ts"
        ],
        "invariant": "Retry and reconciliation must accept only the same verified publication object admitted by the original attempt.",
        "method": "source",
        "result": "PublicationIntent stores only repo, branch and baseSha. getExistingDraft requires a unique open draft in the same repository, matching ref/head, and one parent equal to the base. It does not check the head tree against the verified patch or an expected head digest. reconcile then records that reference and finishes completed without source verification. Normal publishVerified also returns an existing matching draft before writing the verified patch. A same-parent replacement tree therefore survives all source-visible recovery checks if a lower-trust repository writer can mutate that branch.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "fixer/recovery/parent-only-publication-binding"
    ],
    "unresolved": [
      "A harmless same-parent/different-tree transport fixture and recovery replay were not executed because target execution is prohibited and the complete audit sandbox is unavailable.",
      "Repository rulesets and who can rewrite the bot branch are external facts; no live repository was inspected."
    ],
    "assignment_group": "patch-fixer",
    "priority": 2,
    "priority_reason": "Source verification executes lower-trust repository material and consumes privileged publication credentials.",
    "hardening_notes": [
      "The verifier installs time, input and stdout bounds but no explicit per-job CPU, memory, process-count or total-disk quotas. Add such controls to contain arbitrary verification code. This source-only review makes no separate OOM, fork-exhaustion or disk-exhaustion finding without a bounded shared-resource observation and review of outer deployment quotas."
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::ATTACK-CLASSES.md%23Resource%20and%20file%20handling",
    "canonical_refs": {
      "surface": "apps/daemon/src/fix-execution.ts#executorFromEnv",
      "boundary": "packages/fixer/src/verify.ts#verifyPatch",
      "subsystem": "packages/fixer",
      "attack_class": "ATTACK-CLASSES.md#Resource and file handling"
    },
    "surface": "Model patch output, Git source snapshots, verification commands and draft publication",
    "boundary": "Model-generated source and untrusted repository data to isolated execution and GitHub write authority",
    "subsystem": "packages/fixer",
    "attack_class": "Patch path, metadata and file-count guards",
    "starting_paths": [
      "packages/fixer/src",
      "packages/patch/src",
      "apps/daemon/src/fix-execution.ts",
      "apps/daemon/src/run-fix.ts",
      "apps/daemon/src/publication.ts",
      "apps/daemon/src/recovery.ts",
      "apps/daemon/src/attempt-lifetime.ts",
      "apps/daemon/src/cancellable-github.ts",
      "apps/daemon/src/fix-recording.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Resource and file handling",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in packages/fixer; this unit covers Patch path, metadata and file-count guards."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-patch-fixer",
    "reviewed_paths": [
      "packages/patch/src/schemas.ts",
      "packages/patch/src/guard.ts",
      "packages/fixer/src/source.ts",
      "packages/fixer/src/workspace.ts",
      "packages/fixer/src/verify.ts",
      "packages/fixer/src/rest.ts",
      "packages/fixer/src/verify.test.ts",
      "packages/fixer/src/source.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "packages/patch/src/schemas.ts",
          "packages/patch/src/guard.ts",
          "packages/fixer/src/source.ts",
          "packages/fixer/src/workspace.ts"
        ],
        "invariant": "Patch and source paths cannot escape the workspace, alias Git metadata, overlap repository files/directories, or introduce ambiguous casing or source modes.",
        "method": "source",
        "result": "The guards reject absolute, backslash, NUL, empty, dot and parent components, enforce allowed/forbidden globs, reject case-folded duplicates, and additionally reject control characters and every .git component. Selected source entries permit only regular/executable blob modes, reject case collisions and file/directory collisions, and validate content hashes. validatePatchTargets compares against the full repository metadata, including excluded symlinks, before writes. Workspace construction uses a fresh private directory, exclusive initial writes and per-component symlink checks. Ordinary traversal and static alias paths stop at these checks; concurrent post-command ownership is assessed in its separate assigned unit.",
        "artifact": null
      },
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "packages/fixer/src/verify.ts",
          "packages/fixer/src/rest.ts",
          "packages/fixer/src/verify.test.ts",
          "packages/fixer/src/source.test.ts"
        ],
        "invariant": "File counts, source bytes, binary source and actual additions/deletions must be bounded before publication, independent of the model's reported metadata.",
        "method": "source",
        "result": "REST limits a tree to 20,000 entries and rejects truncation, limits decoded blobs to 1 MiB and responses to 8 MiB, checks base64 identity/size, decodes UTF-8 fatally and rejects NULs. prepareSource limits selected files to 200 and total selected content to 1 MiB, verifies blob hashes, and checks declared and actual bytes. guardPatch bounds files and complete content line counts. verifyPatch computes actual numstat with external diff/textconv/renames disabled, requires exactly the proposed changed paths, and reruns the line guard using actual additions plus deletions, including deletions reported as zero by the model. Tests were inspected as source only. No surviving static path/file-count or underreported-deletion bypass was found.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "patch-fixer",
    "priority": 2,
    "priority_reason": "Source verification executes lower-trust repository material and consumes privileged publication credentials.",
    "hardening_notes": [
      "The verifier installs time, input and stdout bounds but no explicit per-job CPU, memory, process-count or total-disk quotas. Add such controls to contain arbitrary verification code. This source-only review makes no separate OOM, fork-exhaustion or disk-exhaustion finding without a bounded shared-resource observation and review of outer deployment quotas."
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::DESKTOP-MOBILE-AND-LOCAL-IPC.md%23Local%20file%20ownership%20and%20TOCTOU",
    "canonical_refs": {
      "surface": "apps/daemon/src/fix-execution.ts#executorFromEnv",
      "boundary": "packages/fixer/src/verify.ts#verifyPatch",
      "subsystem": "packages/fixer",
      "attack_class": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Local file ownership and TOCTOU"
    },
    "surface": "Model patch output, Git source snapshots, verification commands and draft publication",
    "boundary": "Model-generated source and untrusted repository data to isolated execution and GitHub write authority",
    "subsystem": "packages/fixer",
    "attack_class": "Sandbox file ownership and post-check verification",
    "starting_paths": [
      "packages/fixer/src",
      "packages/patch/src",
      "apps/daemon/src/fix-execution.ts",
      "apps/daemon/src/run-fix.ts",
      "apps/daemon/src/publication.ts",
      "apps/daemon/src/recovery.ts",
      "apps/daemon/src/attempt-lifetime.ts",
      "apps/daemon/src/cancellable-github.ts",
      "apps/daemon/src/fix-recording.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Resource and file handling",
    "selected_companion_blocks": [
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Core discipline",
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Local file ownership and TOCTOU",
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Universal moves",
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in packages/fixer; this unit covers Sandbox file ownership and post-check verification."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-patch-fixer",
    "reviewed_paths": [
      "packages/fixer/src/workspace.ts",
      "packages/fixer/src/verify.ts",
      "packages/fixer/src/sandbox.ts",
      "packages/fixer/src/verify-base.test.ts",
      "packages/fixer/src/sandbox-process.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "packages/fixer/src/workspace.ts",
          "packages/fixer/src/verify.ts",
          "packages/fixer/src/verify-base.test.ts"
        ],
        "invariant": "After each check, the parent accepts only the proposed regular files and preserved modes, and publishes from immutable verified memory rather than reopening workspace files.",
        "method": "source",
        "result": "assertWorkspace checks root identity, symlinks, expected directory prefixes, regular-file entries, exact byte size, executable status, content and missing files after every configured check. The verifier holds a parsed in-memory patch and hashes the complete receipt; publication does not consume later workspace bytes. Existing root-symlink, content-mutation and mode-mutation tests were read only. No static replacement-to-publication substitution was established. The walk uses separate readdir/lstat/readFile operations, so the assumption that sandbox writers have terminated remains important.",
        "artifact": null
      },
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "packages/fixer/src/sandbox.ts",
          "packages/fixer/src/sandbox-process.test.ts"
        ],
        "invariant": "Every untrusted descendant must terminate before host-side workspace inspection and cleanup begin.",
        "method": "source",
        "result": "execute kills only the initial detached process group. The macOS policy permits fork and same-sandbox child groups and has no process namespace or descendant supervisor. A child that starts another session with ignored stdio can therefore remain a potential workspace writer after the foreground command closes; a child retaining stdout can instead keep close pending beyond the timer. The existing process test explicitly exercises a detached child group but kills it itself. This unit links the process-lifetime root cause; it does not claim a demonstrated host-file disclosure or publication of workspace bytes.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "fixer/sandbox/macos-detached-descendant-lifetime"
    ],
    "unresolved": [
      "The macOS descendant/session behavior and continued writer lifetime require a bounded dummy-process check. No target-controlled process can be run under the present execution prohibition and incomplete memory/cumulative-disk sandbox."
    ],
    "assignment_group": "patch-fixer",
    "priority": 2,
    "priority_reason": "Source verification executes lower-trust repository material and consumes privileged publication credentials.",
    "hardening_notes": [
      "The verifier installs time, input and stdout bounds but no explicit per-job CPU, memory, process-count or total-disk quotas. Add such controls to contain arbitrary verification code. This source-only review makes no separate OOM, fork-exhaustion or disk-exhaustion finding without a bounded shared-resource observation and review of outer deployment quotas."
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Worker%2C%20pool%2C%20and%20priority%20starvation",
    "canonical_refs": {
      "surface": "apps/daemon/src/fix-execution.ts#executorFromEnv",
      "boundary": "packages/fixer/src/verify.ts#verifyPatch",
      "subsystem": "packages/fixer",
      "attack_class": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Worker, pool, and priority starvation"
    },
    "surface": "Model patch output, Git source snapshots, verification commands and draft publication",
    "boundary": "Model-generated source and untrusted repository data to isolated execution and GitHub write authority",
    "subsystem": "packages/fixer",
    "attack_class": "Verification process and resource containment",
    "starting_paths": [
      "packages/fixer/src",
      "packages/patch/src",
      "apps/daemon/src/fix-execution.ts",
      "apps/daemon/src/run-fix.ts",
      "apps/daemon/src/publication.ts",
      "apps/daemon/src/recovery.ts",
      "apps/daemon/src/attempt-lifetime.ts",
      "apps/daemon/src/cancellable-github.ts",
      "apps/daemon/src/fix-recording.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Resource and file handling",
    "selected_companion_blocks": [
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Core discipline",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Worker, pool, and priority starvation",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Universal moves",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in packages/fixer; this unit covers Verification process and resource containment."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-patch-fixer",
    "reviewed_paths": [
      "packages/fixer/src/verify.ts",
      "packages/fixer/src/sandbox.ts",
      "apps/daemon/src/fix-execution.ts",
      "apps/daemon/src/attempt-lifetime.ts",
      "apps/daemon/src/command-lifetime.ts",
      "apps/daemon/src/command-handler.ts",
      "packages/policy/src/evaluation.ts",
      "packages/fixer/src/sandbox.test.ts",
      "packages/fixer/src/sandbox-process.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "packages/fixer/src/verify.ts",
          "apps/daemon/src/fix-execution.ts",
          "apps/daemon/src/command-handler.ts",
          "packages/policy/src/evaluation.ts",
          "packages/fixer/src/sandbox.test.ts"
        ],
        "invariant": "Accepted source/model work must have command cardinality, elapsed-time, output and policy-admission bounds before consuming shared verifier resources.",
        "method": "source",
        "result": "verifyPatch requires 1-20 argv commands with at most 100 arguments each and a 1-120,000 ms total command deadline; every sandbox call receives the remaining budget. Source and patch guards constrain intake, stdout is capped at 2 MiB, and policy checks confidence, diagnosis, publication and spend counters. The HTTP handler also bounds request bytes and response wait time. These bounds do not settle descendant lifetime because timeout enforcement relies on one process group and on receiving close; the inspected timeout test covers only a directly sleeping command.",
        "artifact": null
      },
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "packages/fixer/src/sandbox.ts",
          "apps/daemon/src/attempt-lifetime.ts",
          "apps/daemon/src/command-lifetime.ts",
          "packages/fixer/src/sandbox-process.test.ts"
        ],
        "invariant": "A repository-controlled check cannot retain a daemon operation or child process after its deadline by changing its process group or keeping inherited output open.",
        "method": "source",
        "result": "On macOS the sandbox permits child groups, while stop sends SIGKILL only to -child.pid. The timer neither rejects the promise independently nor waits for every descendant. A detached descendant holding stdout can delay the sole close handler after the timeout; an ignored-stdio descendant can survive successful return. The former retains the Work promise and can continue lease heartbeats, while drainCommands awaits all pending operations. The Linux bubblewrap path has a separate PID-namespace control, so this candidate is limited to the macOS adapter. No saturation, OOM or disk-exhaustion result is claimed.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "fixer/sandbox/macos-detached-descendant-lifetime"
    ],
    "unresolved": [
      "A strictly bounded macOS fixture must observe one detached descendant and elapsed completion time past a short verifier deadline; no such execution was authorized or performed.",
      "Actual verification commands and outer process supervision are operator-owned deployment facts. The path requires a configured command that executes repository-controlled code."
    ],
    "assignment_group": "patch-fixer",
    "priority": 2,
    "priority_reason": "Source verification executes lower-trust repository material and consumes privileged publication credentials.",
    "hardening_notes": [
      "The verifier installs time, input and stdout bounds but no explicit per-job CPU, memory, process-count or total-disk quotas. Add such controls to contain arbitrary verification code. This source-only review makes no separate OOM, fork-exhaustion or disk-exhaustion finding without a bounded shared-resource observation and review of outer deployment quotas."
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::SUPPLY-CHAIN-AND-RELEASE.md%23Build-to-promotion%20substitution",
    "canonical_refs": {
      "surface": "apps/daemon/src/fix-execution.ts#executorFromEnv",
      "boundary": "packages/fixer/src/verify.ts#verifyPatch",
      "subsystem": "packages/fixer",
      "attack_class": "SUPPLY-CHAIN-AND-RELEASE.md#Build-to-promotion substitution"
    },
    "surface": "Model patch output, Git source snapshots, verification commands and draft publication",
    "boundary": "Model-generated source and untrusted repository data to isolated execution and GitHub write authority",
    "subsystem": "packages/fixer",
    "attack_class": "Verified source and publication identity binding",
    "starting_paths": [
      "packages/fixer/src",
      "packages/patch/src",
      "apps/daemon/src/fix-execution.ts",
      "apps/daemon/src/run-fix.ts",
      "apps/daemon/src/publication.ts",
      "apps/daemon/src/recovery.ts",
      "apps/daemon/src/attempt-lifetime.ts",
      "apps/daemon/src/cancellable-github.ts",
      "apps/daemon/src/fix-recording.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Build-to-promotion substitution",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Resource and file handling",
        "reason": "This distinct ordinary class has a sibling unit in packages/fixer; this unit covers Verified source and publication identity binding."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-patch-fixer",
    "reviewed_paths": [
      "packages/fixer/src/source.ts",
      "packages/fixer/src/verify.ts",
      "packages/fixer/src/verified-publication.ts",
      "packages/fixer/src/open-pr.ts",
      "packages/fixer/src/rest.ts",
      "packages/fixer/src/branch.ts",
      "packages/fixer/src/verified-publication.test.ts",
      "packages/fixer/src/source-rest.test.ts",
      "packages/work/src/state.ts",
      "apps/daemon/src/publication.ts",
      "apps/daemon/src/recovery.ts",
      "apps/api/src/work-items/work-item.publication.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "packages/fixer/src/source.ts",
          "packages/fixer/src/verify.ts",
          "packages/fixer/src/open-pr.ts",
          "packages/fixer/src/branch.ts",
          "packages/fixer/src/verified-publication.test.ts"
        ],
        "invariant": "Fresh publication must use the same Deployment commit, source tree, blob identities, patch contents and file modes that verification accepted.",
        "method": "source",
        "result": "Source is read at the Deployment SHA rather than mutable branch HEAD. Blob hashes and base identities are checked before verification. The in-process WeakMap receipt covers the full verified result and snapshot hash, and publication checks it before cloning the source, policy and patch. A fresh draft uses the recorded base tree and commit parent, creates blobs from the verified in-memory patch, and preserves original executable modes. The deterministic branch identity incorporates incident, snapshot and patch hashes. No fresh-publication object substitution through workspace mutation or branch HEAD movement was found.",
        "artifact": null
      },
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "packages/fixer/src/verified-publication.ts",
          "packages/fixer/src/rest.ts",
          "packages/fixer/src/source-rest.test.ts",
          "packages/work/src/state.ts",
          "apps/daemon/src/publication.ts",
          "apps/daemon/src/recovery.ts",
          "apps/api/src/work-items/work-item.publication.ts"
        ],
        "invariant": "An already-existing or recovered draft must be bound to the same immutable verified content as a newly created draft.",
        "method": "source",
        "result": "The expected patch/snapshot hashes influence the branch name but are not verified against the remote head tree. PublicationPlan and persisted PublicationIntent omit expected head/tree identity. REST recovery validates the current PR head against the current ref and original parent, so a different current tree with that same parent passes. Both publishVerified's existing-draft shortcut and replay reconciliation consume the weaker result. Existing source tests reject moved refs, wrong parents, merge commits and repository mismatches, but contain no different-tree/same-parent rejection. This is the same root cause as the business-logic candidate.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "fixer/recovery/parent-only-publication-binding"
    ],
    "unresolved": [
      "No transport fixture was executed to demonstrate acceptance of a different tree with the same parent; target execution is prohibited and complete memory/cumulative-disk sandbox controls are absent.",
      "The owner must confirm that an actor below Graveshift's verification authority can update the generated branch under the actual GitHub rulesets."
    ],
    "assignment_group": "patch-fixer",
    "priority": 2,
    "priority_reason": "Source verification executes lower-trust repository material and consumes privileged publication credentials.",
    "hardening_notes": [
      "The verifier installs time, input and stdout bounds but no explicit per-job CPU, memory, process-count or total-disk quotas. Add such controls to contain arbitrary verification code. This source-only review makes no separate OOM, fork-exhaustion or disk-exhaustion finding without a bounded shared-resource observation and review of outer deployment quotas."
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::SUPPLY-CHAIN-AND-RELEASE.md%23Untrusted%20code%20in%20a%20privileged%20workflow",
    "canonical_refs": {
      "surface": "apps/daemon/src/fix-execution.ts#executorFromEnv",
      "boundary": "packages/fixer/src/verify.ts#verifyPatch",
      "subsystem": "packages/fixer",
      "attack_class": "SUPPLY-CHAIN-AND-RELEASE.md#Untrusted code in a privileged workflow"
    },
    "surface": "Model patch output, Git source snapshots, verification commands and draft publication",
    "boundary": "Model-generated source and untrusted repository data to isolated execution and GitHub write authority",
    "subsystem": "packages/fixer",
    "attack_class": "Untrusted verification code to host authority",
    "starting_paths": [
      "packages/fixer/src",
      "packages/patch/src",
      "apps/daemon/src/fix-execution.ts",
      "apps/daemon/src/run-fix.ts",
      "apps/daemon/src/publication.ts",
      "apps/daemon/src/recovery.ts",
      "apps/daemon/src/attempt-lifetime.ts",
      "apps/daemon/src/cancellable-github.ts",
      "apps/daemon/src/fix-recording.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Untrusted code in a privileged workflow",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Resource and file handling",
        "reason": "This distinct ordinary class has a sibling unit in packages/fixer; this unit covers Untrusted verification code to host authority."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-patch-fixer",
    "reviewed_paths": [
      "apps/daemon/src/main.ts",
      "apps/daemon/src/fix-execution.ts",
      "apps/daemon/src/cancellable-github.ts",
      "apps/daemon/src/fix-recording.ts",
      "packages/fixer/src/sandbox.ts",
      "packages/fixer/src/verify.ts",
      "packages/fixer/src/auth.ts",
      "packages/fixer/src/rest.ts",
      "packages/fixer/src/index.ts",
      "packages/fixer/src/client.ts",
      "packages/fixer/src/sandbox.test.ts",
      "packages/fixer/src/sandbox-process.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "packages/fixer/src/sandbox.ts",
          "packages/fixer/src/verify.ts",
          "packages/fixer/src/sandbox.test.ts",
          "packages/fixer/src/sandbox-process.test.ts"
        ],
        "invariant": "The verifier's untrusted child does not receive daemon/provider/GitHub credentials, arbitrary host filesystem access or network authority through the source-visible launch path.",
        "method": "source",
        "result": "sandboxEnv builds an explicit environment with scratch HOME/TMPDIR and safe Git configuration instead of spreading process.env. The macOS profile denies network, host writes, general reads outside enumerated tool/system paths, host signaling, process inspection, mach lookup and Apple events. Linux requires bubblewrap with --unshare-all, no capabilities, read-only tool binds and only the workspace writable; a network namespace alone is rejected. A failed isolation probe or absent sandbox fails closed. All command invocations use the adapter, including initial Git operations. Tests were read only, so this is source control coverage, not a claim of exercised OS enforcement. The separately linked descendant-lifetime issue does not establish a host credential escape.",
        "artifact": null
      },
      {
        "agent_id": "hunt-patch-fixer",
        "reviewed_paths": [
          "apps/daemon/src/main.ts",
          "apps/daemon/src/fix-execution.ts",
          "apps/daemon/src/cancellable-github.ts",
          "apps/daemon/src/fix-recording.ts",
          "packages/fixer/src/auth.ts",
          "packages/fixer/src/rest.ts",
          "packages/fixer/src/index.ts",
          "packages/fixer/src/client.ts"
        ],
        "invariant": "Credential-bearing GitHub calls remain in the trusted daemon and occur only through the verified publication path; test adapters must not become a production sandbox bypass.",
        "method": "source",
        "result": "main constructs executorFromEnv without a runner override. GitHub App signing, installation-token acquisition/cache and authenticated fixed-origin REST calls stay in the parent process. createFixExecutor's injectable runner is used by test fixtures; fix-recording is not imported by production main. The package exports verifyPatch and verified publication, and the GitHub interface exposes draft publication with no merge operation. Cancellation is checked before each GitHub method and audit/admission gates precede writes. No additional credential-bearing execution path or production use of the unisolated recording runner was found.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "patch-fixer",
    "priority": 2,
    "priority_reason": "Source verification executes lower-trust repository material and consumes privileged publication credentials.",
    "hardening_notes": [
      "The verifier installs time, input and stdout bounds but no explicit per-job CPU, memory, process-count or total-disk quotas. Add such controls to contain arbitrary verification code. This source-only review makes no separate OOM, fork-exhaustion or disk-exhaustion finding without a bounded shared-resource observation and review of outer deployment quotas."
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Fmain.ts%23privateHandler::apps%2Fapi%2Fsrc%2Fmcp%2Fmcp-token.verifier.ts%23McpBearerGuard::apps%2Fapi%2Fsrc%2Fmcp::DESKTOP-MOBILE-AND-LOCAL-IPC.md%23IPC%20peer-authentication%20gaps",
    "canonical_refs": {
      "surface": "apps/daemon/src/main.ts#privateHandler",
      "boundary": "apps/api/src/mcp/mcp-token.verifier.ts#McpBearerGuard",
      "subsystem": "apps/api/src/mcp",
      "attack_class": "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC peer-authentication gaps"
    },
    "surface": "MCP HTTP/stdio tools, resources, prompts, and API-to-daemon reads",
    "boundary": "Scoped MCP reader to Project context and host-wide collector evidence",
    "subsystem": "apps/api/src/mcp",
    "attack_class": "Local daemon peer authentication and authority",
    "starting_paths": [
      "apps/api/src/mcp",
      "apps/api/src/stdio.ts",
      "apps/daemon/src/read-handler.ts",
      "apps/daemon/src/reads.ts",
      "apps/daemon/src/routes.ts",
      "apps/daemon/src/private-http.ts",
      "apps/daemon/src/collectors.ts",
      "packages/mcp-client/src",
      "packages/metrics/src"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Core discipline",
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#IPC peer-authentication gaps",
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Universal moves",
      "DESKTOP-MOBILE-AND-LOCAL-IPC.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/mcp; this unit covers Local daemon peer authentication and authority."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-mcp-read",
    "reviewed_paths": [
      "apps/daemon/src/main.ts",
      "apps/daemon/src/config.ts",
      "apps/daemon/src/routes.ts",
      "apps/daemon/src/private-http.ts",
      "apps/daemon/src/read-handler.ts",
      "apps/daemon/src/api-client.ts",
      "apps/daemon/src/boot-config.ts",
      "apps/api/src/mcp/daemon-read.config.ts",
      "apps/api/src/mcp/mcp.backend.ts",
      "apps/api/src/internal/internal.guard.ts",
      "apps/api/src/internal/internal-config.controller.ts",
      "apps/api/src/internal/project-grant.ts",
      "docs/adr/0020-local-daemon-transport.md"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-mcp-read",
        "reviewed_paths": [
          "apps/daemon/src/main.ts",
          "apps/daemon/src/config.ts",
          "apps/daemon/src/routes.ts",
          "apps/daemon/src/private-http.ts",
          "apps/daemon/src/read-handler.ts",
          "apps/api/src/mcp/daemon-read.config.ts",
          "apps/api/src/mcp/mcp.backend.ts",
          "docs/adr/0020-local-daemon-transport.md"
        ],
        "invariant": "A lower-trust local process that can reach the daemon listener must not obtain private reads merely by sharing loopback reachability or claiming a Project.",
        "method": "source",
        "result": "Daemon configuration accepts only credential-free loopback HTTP origins, requires non-placeholder internal tokens of at least 32 characters and requires the API and daemon tokens to differ. main.ts uses that validated listener hostname. routes.ts exposes only health without authentication; all read prefixes dispatch to createReadHandler. The handler checks the daemon bearer before method/body processing, compares SHA-256 digests with timingSafeEqual and requires a nonempty provided value. It then validates POST, content type, bounded JSON, an exact action schema and granted Project membership. Health returns only status=ok. The API's named read client supplies its configured daemon bearer, and request-selected arguments cannot replace that header or choose the action path. Source provides capability authentication beyond loopback reachability; no unauthenticated local read was found. Sharing the API process's authorized daemon token across reads and commands is the documented internal principal, not an independently lower-trust reader.",
        "artifact": null
      },
      {
        "agent_id": "hunt-mcp-read",
        "reviewed_paths": [
          "apps/daemon/src/api-client.ts",
          "apps/daemon/src/boot-config.ts",
          "apps/api/src/internal/internal.guard.ts",
          "apps/api/src/internal/internal-config.controller.ts",
          "apps/api/src/internal/project-grant.ts"
        ],
        "invariant": "The daemon's API hop must authenticate with the separate API credential and obtain Project authority from the stored grant rather than a caller-provided local default.",
        "method": "source",
        "result": "createPrivateApi validates the loopback origin, limits constructed paths to the same origin under /internal/, rejects redirects, supplies the API bearer and parses bounded responses. InternalGuard verifies that bearer using a constant-time digest comparison. The protected boot-config controller reads DEFAULT_DAEMON_GRANT from the identity repository; an absent or empty grant cannot start main.ts. Durable read services use ProjectGrant to check the current stored grant. No unauthenticated boot/grant path or source-visible substitution of an external MCP Credential for the internal peer credential was found. Host secret-file permissions and live routing were not inspected, and no missing external deployment control is assumed.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "mcp-read",
    "priority": 5,
    "priority_reason": "MCP exposes scoped data to agents and crosses from authenticated Project context into daemon source reads.",
    "hardening_notes": [
      "Align the resource permission key in apps/api/src/mcp/mcp.permissions.ts:17 with the registered name Autopsy in apps/api/src/mcp/mcp.resources.ts:16. The inspected installed @nestjs/mcp factory passes the registered name to McpScopeGuard, so the current postmortem key fails closed for authenticated resource calls. A positive-scope HTTP resource case should check that behavior; this is an access failure, not a demonstrated security bypass.",
      "packages/mcp-client/src/reply.ts:48 should compare the single returned resource URI with the requested URI as well as checking text, cardinality and MIME type. Only the caller-selected connection can currently supply that reply, and no separate affected principal or privileged consumer was found, so this remains response-validation hardening."
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::AI-AND-LLM.md%23Action-confirmation%20and%20approval%20binding",
    "canonical_refs": {
      "surface": "apps/daemon/src/routing-model.ts#routingModel",
      "boundary": "packages/gateway/src/gateway.ts#createGateway",
      "subsystem": "packages/gateway",
      "attack_class": "AI-AND-LLM.md#Action-confirmation and approval binding"
    },
    "surface": "Prepared incident evidence, agent prompts, routing output and provider completions",
    "boundary": "Untrusted logs and model output to agent capabilities, accepted results, secrets and shared spend",
    "subsystem": "packages/gateway",
    "attack_class": "Agent capability and intentional-action binding",
    "starting_paths": [
      "packages/gateway/src",
      "packages/agents/src",
      "packages/diagnoser/src",
      "packages/redactor/src",
      "packages/config/src",
      "apps/daemon/src/model-context.ts",
      "apps/daemon/src/routing-model.ts",
      "apps/daemon/src/flow-harness.ts",
      "apps/daemon/src/flow-runtime.ts",
      "packages/notifier-discord/src"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "AI-AND-LLM.md#Core discipline",
      "AI-AND-LLM.md#Action-confirmation and approval binding",
      "AI-AND-LLM.md#Universal moves",
      "AI-AND-LLM.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "This distinct ordinary class has a sibling unit in packages/gateway; this unit covers Agent capability and intentional-action binding."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Gateway, diagnoser and routing modules consume per-task evidence; no independent persistent agent-memory writer/retrieval store is configured."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-model",
    "reviewed_paths": [
      "packages/agents/src/config.ts",
      "packages/agents/src/routing.ts",
      "packages/gateway/src/types.ts",
      "packages/gateway/src/adapters.ts",
      "apps/daemon/src/routing-model.ts",
      "apps/daemon/src/work-flow.ts",
      "apps/daemon/src/run-fix.ts",
      "apps/api/src/deploys/deploys.controller.ts",
      "apps/api/src/deploys/deploys.service.ts",
      "apps/api/src/deploys/dto/create-deploy.dto.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/internal/internal-config.controller.ts",
      "apps/daemon/src/fix-context.ts",
      "packages/policy/src/schema.ts",
      "packages/policy/src/decide.ts",
      "packages/policy/src/evaluation.ts",
      "apps/daemon/src/fix-execution.ts",
      "packages/fixer/src/source.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "packages/agents/src/config.ts",
          "packages/agents/src/routing.ts",
          "packages/gateway/src/types.ts",
          "packages/gateway/src/adapters.ts",
          "apps/daemon/src/routing-model.ts",
          "apps/daemon/src/work-flow.ts",
          "apps/daemon/src/run-fix.ts"
        ],
        "invariant": "Routing/model output must not replace the assigned Agent, mint callable tools, or bypass the authorized Work command and policy decision.",
        "method": "source",
        "result": "Production adapters pass a schema, system text, prompt and abort signal to structured generation; they pass no callable tools. Routing returns only a strictly validated question. begin uses the explicit assignment, and resume requires the saved Agent name and slug to match current configuration. Work commands verify the caller Project, and runOwnedFix checks assignment and an audited open_pr decision before execution. allowedTools is configuration data, not a model-controlled tool dispatcher.",
        "artifact": null
      },
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "apps/api/src/deploys/deploys.controller.ts",
          "apps/api/src/deploys/deploys.service.ts",
          "apps/api/src/deploys/dto/create-deploy.dto.ts",
          "apps/api/src/auth/services/event-ingest.service.ts",
          "apps/api/src/internal/internal-config.controller.ts",
          "apps/daemon/src/fix-context.ts",
          "packages/policy/src/schema.ts",
          "packages/policy/src/decide.ts",
          "packages/policy/src/evaluation.ts",
          "apps/daemon/src/fix-execution.ts",
          "packages/fixer/src/source.ts"
        ],
        "invariant": "The repository selected for an authorized Project's Fix must also be authorized for that Project before the daemon uses its GitHub identity.",
        "method": "source",
        "result": "Candidate: the daemon receives one instance policy for its granted Projects. contextClient selects a repository solely by snapshot.item.service; RepoPolicy and policy rules have no Project selector. Its strong checks bind the diagnosis, detections and Deployment SHA to the caller Project, but do not bind that Project to the selected repository. A caller with Deployment-write authority can register a syntactically valid known commit SHA in its own Project. If the instance serves mutually untrusted Projects and permits this service's Fix, prepareFix passes the selected repository and that SHA to prepareSource, whose first GitHub read has no Project authorization check. Investigation stopped at that repository-read boundary.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "daemon/fix-context/service-only-repository-selection"
    ],
    "unresolved": [
      "A bounded dummy-Project reproduction was not run because the parent has not established complete OS-enforced memory and cumulative-disk sandbox controls.",
      "The owner must establish whether one daemon grant includes mutually untrusted Projects whose repository authority is intended to differ."
    ],
    "assignment_group": "model",
    "priority": 7,
    "priority_reason": "Untrusted context can influence privileged patch proposals; deterministic constraints, audit and budgets must hold.",
    "hardening_notes": [
      "packages/gateway/src/budget.ts documents per-process post-response counters. If operators require a strict daily spend ceiling across concurrent calls or restarts, reserve bounded call cost atomically and persist accounting. The current documented overshoot/restart ceiling alone was not reported as an unbounded delegated-loop finding.",
      "packages/agents/src/config.ts exposes allowedTools, but the active gateway adapters supply no callable tools. Keep that distinction explicit in configuration documentation and enforce the field if a callable-tool dispatcher is introduced.",
      "apps/daemon/src/private-http.ts response deadlines do not cancel durable Work commands; apps/daemon/src/command-lifetime.ts owns and drains that work. Expose or document a separate explicit cancellation operation if callers need to revoke a running attempt. Continued execution after the existing response timeout was not treated as an unrequested action."
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::AI-AND-LLM.md%23Indirect%20injection%20through%20retrieved%20or%20ingested%20content",
    "canonical_refs": {
      "surface": "apps/daemon/src/routing-model.ts#routingModel",
      "boundary": "packages/gateway/src/gateway.ts#createGateway",
      "subsystem": "packages/gateway",
      "attack_class": "AI-AND-LLM.md#Indirect injection through retrieved or ingested content"
    },
    "surface": "Prepared incident evidence, agent prompts, routing output and provider completions",
    "boundary": "Untrusted logs and model output to agent capabilities, accepted results, secrets and shared spend",
    "subsystem": "packages/gateway",
    "attack_class": "Untrusted evidence to privileged agent context",
    "starting_paths": [
      "packages/gateway/src",
      "packages/agents/src",
      "packages/diagnoser/src",
      "packages/redactor/src",
      "packages/config/src",
      "apps/daemon/src/model-context.ts",
      "apps/daemon/src/routing-model.ts",
      "apps/daemon/src/flow-harness.ts",
      "apps/daemon/src/flow-runtime.ts",
      "packages/notifier-discord/src"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
    "selected_companion_blocks": [
      "AI-AND-LLM.md#Core discipline",
      "AI-AND-LLM.md#Indirect injection through retrieved or ingested content",
      "AI-AND-LLM.md#Universal moves",
      "AI-AND-LLM.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in packages/gateway; this unit covers Untrusted evidence to privileged agent context."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Gateway, diagnoser and routing modules consume per-task evidence; no independent persistent agent-memory writer/retrieval store is configured."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-model",
    "reviewed_paths": [
      "packages/agents/src/untrusted.ts",
      "packages/agents/src/config.ts",
      "packages/agents/src/routing.ts",
      "packages/config/src/prompt.ts",
      "packages/diagnoser/src/context.ts",
      "packages/diagnoser/src/diagnose.ts",
      "packages/patch/src/generate.ts",
      "packages/patch/src/guard.ts",
      "apps/api/src/work-items/work-haunting.mapper.ts",
      "apps/api/src/work-items/work-ingress.service.ts",
      "apps/daemon/src/observations.ts",
      "apps/daemon/src/main.ts",
      "apps/daemon/src/reads.ts",
      "apps/daemon/src/fix-context.ts",
      "apps/daemon/src/fix-execution.ts",
      "packages/notifier-discord/src/index.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "packages/agents/src/untrusted.ts",
          "packages/agents/src/config.ts",
          "packages/agents/src/routing.ts",
          "packages/config/src/prompt.ts",
          "packages/diagnoser/src/context.ts",
          "packages/diagnoser/src/diagnose.ts",
          "packages/patch/src/generate.ts",
          "packages/patch/src/guard.ts",
          "apps/api/src/work-items/work-haunting.mapper.ts",
          "apps/api/src/work-items/work-ingress.service.ts",
          "packages/notifier-discord/src/index.ts"
        ],
        "invariant": "Lower-trust telemetry, parameters, diagnoses and repository text must not become a permission grant through prompt text or model output.",
        "method": "source",
        "result": "Prepared evidence, request text, parameter values, diagnosis text and repository source are framed as untrusted data, with wrapper-closing text neutralized and template values replaced in one pass. These prompt measures were not treated as authorization. The deterministic controls are fixed structured schemas, diagnosis reference/excerpt validation, configured Agent selection, policy evaluation and a patch guard before accepted success. Keyword-based initial assignment uses global configured Agents and remains behind normal autoFix/Work policy gates. No independent persistent model-memory store or Discord publication implementation exists in the reviewed paths. Prompt influence alone was not promoted.",
        "artifact": null
      },
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "apps/daemon/src/observations.ts",
          "apps/daemon/src/main.ts",
          "apps/daemon/src/reads.ts",
          "apps/daemon/src/fix-context.ts",
          "apps/daemon/src/fix-execution.ts"
        ],
        "invariant": "Ingested evidence must only retrieve host evidence and repository context authorized for the Event/Work Project.",
        "method": "source",
        "result": "Two concrete context-selection gaps survive source review: main discards the Project argument on observation log reads, and fix-context resolves repositories by service alone. Untrusted service names can therefore select resources beyond the Project-scoped durable records when the instance hosts mutually untrusted resources. These are linked to their common source-derived fingerprints; no separate generic prompt-injection finding is asserted.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "daemon/fix-context/service-only-repository-selection",
      "apps/daemon/src/reads.ts:collector-evidence-without-project"
    ],
    "unresolved": [
      "Both linked candidates require bounded dummy-resource validation; target-controlled execution is prohibited because complete OS-enforced memory and cumulative-disk sandbox controls are absent.",
      "The owner must establish the co-tenancy and resource ownership conditions identified in the linked candidates."
    ],
    "assignment_group": "model",
    "priority": 7,
    "priority_reason": "Untrusted context can influence privileged patch proposals; deterministic constraints, audit and budgets must hold.",
    "hardening_notes": [
      "packages/gateway/src/budget.ts documents per-process post-response counters. If operators require a strict daily spend ceiling across concurrent calls or restarts, reserve bounded call cost atomically and persist accounting. The current documented overshoot/restart ceiling alone was not reported as an unbounded delegated-loop finding.",
      "packages/agents/src/config.ts exposes allowedTools, but the active gateway adapters supply no callable tools. Keep that distinction explicit in configuration documentation and enforce the field if a callable-tool dispatcher is introduced.",
      "apps/daemon/src/private-http.ts response deadlines do not cancel durable Work commands; apps/daemon/src/command-lifetime.ts owns and drains that work. Expose or document a separate explicit cancellation operation if callers need to revoke a running attempt. Continued execution after the existing response timeout was not treated as an unrequested action."
    ],
    "root_cause_aliases": [
      {
        "alias": "daemon/observations/projectless-collector-log-context",
        "canonical": "apps/daemon/src/reads.ts:collector-evidence-without-project",
        "reason": "Both variants reach the same host-wide collector reader whose final resource lookup lacks Project authorization; MCP and Event diagnosis are alternate entry/output paths for that root cause."
      }
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::AI-AND-LLM.md%23Sensitive%20context%20extraction",
    "canonical_refs": {
      "surface": "apps/daemon/src/routing-model.ts#routingModel",
      "boundary": "packages/gateway/src/gateway.ts#createGateway",
      "subsystem": "packages/gateway",
      "attack_class": "AI-AND-LLM.md#Sensitive context extraction"
    },
    "surface": "Prepared incident evidence, agent prompts, routing output and provider completions",
    "boundary": "Untrusted logs and model output to agent capabilities, accepted results, secrets and shared spend",
    "subsystem": "packages/gateway",
    "attack_class": "Provider context and output secret disclosure",
    "starting_paths": [
      "packages/gateway/src",
      "packages/agents/src",
      "packages/diagnoser/src",
      "packages/redactor/src",
      "packages/config/src",
      "apps/daemon/src/model-context.ts",
      "apps/daemon/src/routing-model.ts",
      "apps/daemon/src/flow-harness.ts",
      "apps/daemon/src/flow-runtime.ts",
      "packages/notifier-discord/src"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Feature abuse and data leakage",
    "selected_companion_blocks": [
      "AI-AND-LLM.md#Core discipline",
      "AI-AND-LLM.md#Sensitive context extraction",
      "AI-AND-LLM.md#Universal moves",
      "AI-AND-LLM.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "This distinct ordinary class has a sibling unit in packages/gateway; this unit covers Provider context and output secret disclosure."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Gateway, diagnoser and routing modules consume per-task evidence; no independent persistent agent-memory writer/retrieval store is configured."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-model",
    "reviewed_paths": [
      "packages/gateway/src/adapters.ts",
      "packages/gateway/src/providers.ts",
      "packages/gateway/src/gateway.ts",
      "packages/gateway/src/completion.ts",
      "packages/redactor/src/index.ts",
      "packages/redactor/src/detectors.ts",
      "packages/config/src/schema.ts",
      "packages/config/src/load.ts",
      "packages/config/src/prompt.ts",
      "apps/daemon/src/boot-config.ts",
      "apps/api/src/auth/dto/create-credential.dto.ts",
      "apps/api/src/auth/services/credential.service.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "packages/watcher/src/rules.ts",
      "apps/daemon/src/observations.ts",
      "apps/daemon/src/main.ts",
      "apps/daemon/src/reads.ts",
      "apps/daemon/src/collectors.ts",
      "packages/integrations/src/reads.ts",
      "packages/sources-docker/src/source.ts",
      "packages/sources-k8s/src/source.ts",
      "packages/diagnoser/src/context.ts",
      "packages/diagnoser/src/diagnose.ts",
      "packages/core/src/recorded.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "packages/gateway/src/adapters.ts",
          "packages/gateway/src/providers.ts",
          "packages/gateway/src/gateway.ts",
          "packages/gateway/src/completion.ts",
          "packages/redactor/src/index.ts",
          "packages/redactor/src/detectors.ts",
          "packages/config/src/schema.ts",
          "packages/config/src/load.ts",
          "packages/config/src/prompt.ts",
          "apps/daemon/src/boot-config.ts"
        ],
        "invariant": "Provider credentials must remain outside model text, and recognized secrets in context and error feedback must be redacted before outbound model requests.",
        "method": "source",
        "result": "Provider keys are resolved only from the configured environment-variable name and supplied to the provider factory, rather than inserted into model prompts. Agent endpoints require HTTPS without URL credentials. The gateway redacts system text, prompt text, validation feedback and terminal invalid/audit reasons. Raw transport exceptions are mapped to fixed typed reasons. Config is operator-provided boot data, not a telemetry-controlled endpoint or credential selector. No ignored environment or credential-settings file was inspected for this check, and no live key value is recorded.",
        "artifact": null
      },
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "apps/api/src/auth/dto/create-credential.dto.ts",
          "apps/api/src/auth/services/credential.service.ts",
          "apps/api/src/auth/services/event-ingest.service.ts",
          "packages/watcher/src/rules.ts",
          "apps/daemon/src/observations.ts",
          "apps/daemon/src/main.ts",
          "apps/daemon/src/reads.ts",
          "apps/daemon/src/collectors.ts",
          "packages/integrations/src/reads.ts",
          "packages/sources-docker/src/source.ts",
          "packages/sources-k8s/src/source.ts",
          "packages/diagnoser/src/context.ts",
          "packages/diagnoser/src/diagnose.ts",
          "packages/core/src/recorded.ts"
        ],
        "invariant": "An Event accepted for Project A must not cause private workload logs belonging to Project B to enter Project A's diagnosis context or stored diagnosis.",
        "method": "source",
        "result": "Candidate: plugin Credential service names are caller-selected, and ingestion checks Project and optional service equality without resolving a Project-owned workload. A single runtime.oom observation can reach diagnosis without a Deployment. observations supplies projectId to its log callback, but main wires a two-argument callback to reads.logs. That reader enumerates host-wide Collectors and accepts a unique service-name match with no Project check. Both Docker and Kubernetes tailLogs select workloads without caller Project identity. Prepared context then labels the returned logs as valid evidence; reference/excerpt validation establishes quotation accuracy, not ownership. Redaction cannot isolate ordinary private log content. The same diagnosis is subsequently prepared for storage in the Event's Project. Investigation stopped at this context/diagnosis boundary.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "apps/daemon/src/reads.ts:collector-evidence-without-project"
    ],
    "unresolved": [
      "No outgoing provider prompt or persisted dummy diagnosis was observed: target-controlled execution is prohibited because complete OS-enforced memory and cumulative-disk sandbox controls are absent.",
      "The owner must establish whether the shared daemon's Collector inventory includes a workload whose logs are private to a different Organization/Project from the telemetry producer."
    ],
    "assignment_group": "model",
    "priority": 7,
    "priority_reason": "Untrusted context can influence privileged patch proposals; deterministic constraints, audit and budgets must hold.",
    "hardening_notes": [
      "packages/gateway/src/budget.ts documents per-process post-response counters. If operators require a strict daily spend ceiling across concurrent calls or restarts, reserve bounded call cost atomically and persist accounting. The current documented overshoot/restart ceiling alone was not reported as an unbounded delegated-loop finding.",
      "packages/agents/src/config.ts exposes allowedTools, but the active gateway adapters supply no callable tools. Keep that distinction explicit in configuration documentation and enforce the field if a callable-tool dispatcher is introduced.",
      "apps/daemon/src/private-http.ts response deadlines do not cancel durable Work commands; apps/daemon/src/command-lifetime.ts owns and drains that work. Expose or document a separate explicit cancellation operation if callers need to revoke a running attempt. Continued execution after the existing response timeout was not treated as an unrequested action."
    ],
    "root_cause_aliases": [
      {
        "alias": "daemon/observations/projectless-collector-log-context",
        "canonical": "apps/daemon/src/reads.ts:collector-evidence-without-project",
        "reason": "Both variants reach the same host-wide collector reader whose final resource lookup lacks Project authorization; MCP and Event diagnosis are alternate entry/output paths for that root cause."
      }
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::AI-AND-LLM.md%23Tool-schema%20and%20dispatcher%20disagreement",
    "canonical_refs": {
      "surface": "apps/daemon/src/routing-model.ts#routingModel",
      "boundary": "packages/gateway/src/gateway.ts#createGateway",
      "subsystem": "packages/gateway",
      "attack_class": "AI-AND-LLM.md#Tool-schema and dispatcher disagreement"
    },
    "surface": "Prepared incident evidence, agent prompts, routing output and provider completions",
    "boundary": "Untrusted logs and model output to agent capabilities, accepted results, secrets and shared spend",
    "subsystem": "packages/gateway",
    "attack_class": "Model output and schema dispatch boundaries",
    "starting_paths": [
      "packages/gateway/src",
      "packages/agents/src",
      "packages/diagnoser/src",
      "packages/redactor/src",
      "packages/config/src",
      "apps/daemon/src/model-context.ts",
      "apps/daemon/src/routing-model.ts",
      "apps/daemon/src/flow-harness.ts",
      "apps/daemon/src/flow-runtime.ts",
      "packages/notifier-discord/src"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Injection",
    "selected_companion_blocks": [
      "AI-AND-LLM.md#Core discipline",
      "AI-AND-LLM.md#Tool-schema and dispatcher disagreement",
      "AI-AND-LLM.md#Universal moves",
      "AI-AND-LLM.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "This distinct ordinary class has a sibling unit in packages/gateway; this unit covers Model output and schema dispatch boundaries."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Gateway, diagnoser and routing modules consume per-task evidence; no independent persistent agent-memory writer/retrieval store is configured."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-model",
    "reviewed_paths": [
      "packages/gateway/src/gateway.ts",
      "packages/gateway/src/types.ts",
      "packages/gateway/src/adapters.ts",
      "apps/daemon/src/routing-model.ts",
      "packages/agents/src/routing.ts",
      "packages/agents/src/config.ts",
      "packages/diagnoser/src/types.ts",
      "packages/diagnoser/src/diagnose.ts",
      "packages/patch/src/schemas.ts",
      "packages/patch/src/generate.ts",
      "packages/patch/src/guard.ts",
      "packages/fixer/src/source.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "packages/gateway/src/gateway.ts",
          "packages/gateway/src/types.ts",
          "packages/gateway/src/adapters.ts",
          "apps/daemon/src/routing-model.ts",
          "packages/agents/src/routing.ts",
          "packages/agents/src/config.ts",
          "packages/diagnoser/src/types.ts",
          "packages/diagnoser/src/diagnose.ts"
        ],
        "invariant": "Handlers must consume the same normalized object that passed schema and semantic validation, with no model-selected alternate tool or authority fields.",
        "method": "source",
        "result": "The gateway safe-parses response.object, runs task.validate on parsed.data, and returns that same parsed.data. Routing accepts only a strict bounded question object. Diagnosis schemas constrain categories, confidence and nonempty evidence; unrecognized keys are stripped before consumption, and evidence references/excerpts are checked against the retained context. Agent identity, endpoints and allowedTools are never deserialized from a completion into executable capabilities. No schema/dispatcher disagreement was found in these paths.",
        "artifact": null
      },
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "packages/patch/src/schemas.ts",
          "packages/patch/src/generate.ts",
          "packages/patch/src/guard.ts",
          "packages/fixer/src/source.ts"
        ],
        "invariant": "Model-supplied file paths, change counts and source identities must remain constrained after normalization and before a patch becomes accepted input.",
        "method": "source",
        "result": "Patch/file schemas are strict. generatePatch re-parses accepted output and repeats guardPatch before returning success. The guard rejects unsafe/duplicate paths, forbidden and nonallowlisted targets, invalid negative/fractional counts and inconsistent deletion identities; it counts actual full-file lines so underreported linesChanged cannot lower the charge. Source checks bind base commit/blob identities and reject target collisions. Investigation stopped at these deterministic output controls; no downstream sandbox or publication bypass is claimed.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "model",
    "priority": 7,
    "priority_reason": "Untrusted context can influence privileged patch proposals; deterministic constraints, audit and budgets must hold.",
    "hardening_notes": [
      "packages/gateway/src/budget.ts documents per-process post-response counters. If operators require a strict daily spend ceiling across concurrent calls or restarts, reserve bounded call cost atomically and persist accounting. The current documented overshoot/restart ceiling alone was not reported as an unbounded delegated-loop finding.",
      "packages/agents/src/config.ts exposes allowedTools, but the active gateway adapters supply no callable tools. Keep that distinction explicit in configuration documentation and enforce the field if a callable-tool dispatcher is introduced.",
      "apps/daemon/src/private-http.ts response deadlines do not cancel durable Work commands; apps/daemon/src/command-lifetime.ts owns and drains that work. Expose or document a separate explicit cancellation operation if callers need to revoke a running attempt. Continued execution after the existing response timeout was not treated as an unrequested action."
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::AI-AND-LLM.md%23Unbounded%20delegated%20action%20loops",
    "canonical_refs": {
      "surface": "apps/daemon/src/routing-model.ts#routingModel",
      "boundary": "packages/gateway/src/gateway.ts#createGateway",
      "subsystem": "packages/gateway",
      "attack_class": "AI-AND-LLM.md#Unbounded delegated action loops"
    },
    "surface": "Prepared incident evidence, agent prompts, routing output and provider completions",
    "boundary": "Untrusted logs and model output to agent capabilities, accepted results, secrets and shared spend",
    "subsystem": "packages/gateway",
    "attack_class": "Provider budgets and delegated loop accounting",
    "starting_paths": [
      "packages/gateway/src",
      "packages/agents/src",
      "packages/diagnoser/src",
      "packages/redactor/src",
      "packages/config/src",
      "apps/daemon/src/model-context.ts",
      "apps/daemon/src/routing-model.ts",
      "apps/daemon/src/flow-harness.ts",
      "apps/daemon/src/flow-runtime.ts",
      "packages/notifier-discord/src"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "AI-AND-LLM.md#Core discipline",
      "AI-AND-LLM.md#Unbounded delegated action loops",
      "AI-AND-LLM.md#Universal moves",
      "AI-AND-LLM.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "This distinct ordinary class has a sibling unit in packages/gateway; this unit covers Provider budgets and delegated loop accounting."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Gateway, diagnoser and routing modules consume per-task evidence; no independent persistent agent-memory writer/retrieval store is configured."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-model",
    "reviewed_paths": [
      "packages/gateway/src/config.ts",
      "packages/gateway/src/gateway.ts",
      "packages/gateway/src/adapters.ts",
      "packages/gateway/src/accounting.ts",
      "packages/gateway/src/budget.ts",
      "packages/agents/src/routing.ts",
      "packages/diagnoser/src/diagnose.ts",
      "apps/daemon/src/observations.ts",
      "packages/watcher/src/rules.ts",
      "apps/daemon/src/work-activation.ts",
      "apps/daemon/src/run-fix.ts",
      "packages/policy/src/evaluation.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "packages/gateway/src/config.ts",
          "packages/gateway/src/gateway.ts",
          "packages/gateway/src/adapters.ts",
          "packages/gateway/src/accounting.ts",
          "packages/gateway/src/budget.ts"
        ],
        "invariant": "A model response must not create an unbounded retry/delegation loop or disable known-usage accounting.",
        "method": "source",
        "result": "Transport retries are bounded by operator configuration, SDK retries are zero, and there is at most one semantic correction generation: at most 2*(maxRetries+1) adapter calls per gateway task. No completion field changes this count or enqueues another task. Known billed usage, including malformed SDK object output, is recorded before validation. Missing/invalid successful-response usage or unknown pricing marks global and Agent counters unpriced and stops later calls. Budgets are checked before initial generation and before semantic correction. Their documented post-response, per-process ceiling permits single-call/concurrent overshoot and reset on restart; this was retained as hardening rather than an unbounded delegated-loop finding.",
        "artifact": null
      },
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "packages/agents/src/routing.ts",
          "packages/diagnoser/src/diagnose.ts",
          "apps/daemon/src/observations.ts",
          "packages/watcher/src/rules.ts",
          "apps/daemon/src/work-activation.ts",
          "apps/daemon/src/run-fix.ts",
          "packages/policy/src/evaluation.ts"
        ],
        "invariant": "A bounded observation or routing answer must not recursively re-enter diagnosis or create repeated autonomous Fix work.",
        "method": "source",
        "result": "Routing asks once and resume either fills the original Agent's parameters or returns needs_human without another question. Observation processing reuses a persisted diagnosis and a deterministic Project/incident activation command. Watcher observation types exclude crew output such as diagnosis.ready, preventing model-output feedback into detection. Fix policy gates confidence, diagnosis loops, PR counters and LLM spend before routing/execution. No model-driven unbounded loop was found.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "model",
    "priority": 7,
    "priority_reason": "Untrusted context can influence privileged patch proposals; deterministic constraints, audit and budgets must hold.",
    "hardening_notes": [
      "packages/gateway/src/budget.ts documents per-process post-response counters. If operators require a strict daily spend ceiling across concurrent calls or restarts, reserve bounded call cost atomically and persist accounting. The current documented overshoot/restart ceiling alone was not reported as an unbounded delegated-loop finding.",
      "packages/agents/src/config.ts exposes allowedTools, but the active gateway adapters supply no callable tools. Keep that distinction explicit in configuration documentation and enforce the field if a callable-tool dispatcher is introduced.",
      "apps/daemon/src/private-http.ts response deadlines do not cancel durable Work commands; apps/daemon/src/command-lifetime.ts owns and drains that work. Expose or document a separate explicit cancellation operation if callers need to revoke a running attempt. Continued execution after the existing response timeout was not treated as an unrequested action."
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::ATTACK-CLASSES.md%23Business%20logic",
    "canonical_refs": {
      "surface": "apps/daemon/src/routing-model.ts#routingModel",
      "boundary": "packages/gateway/src/gateway.ts#createGateway",
      "subsystem": "packages/gateway",
      "attack_class": "ATTACK-CLASSES.md#Business logic"
    },
    "surface": "Prepared incident evidence, agent prompts, routing output and provider completions",
    "boundary": "Untrusted logs and model output to agent capabilities, accepted results, secrets and shared spend",
    "subsystem": "packages/gateway",
    "attack_class": "Audit acknowledgment and fallback result integrity",
    "starting_paths": [
      "packages/gateway/src",
      "packages/agents/src",
      "packages/diagnoser/src",
      "packages/redactor/src",
      "packages/config/src",
      "apps/daemon/src/model-context.ts",
      "apps/daemon/src/routing-model.ts",
      "apps/daemon/src/flow-harness.ts",
      "apps/daemon/src/flow-runtime.ts",
      "packages/notifier-discord/src"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "This distinct ordinary class has a sibling unit in packages/gateway; this unit covers Audit acknowledgment and fallback result integrity."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Gateway, diagnoser and routing modules consume per-task evidence; no independent persistent agent-memory writer/retrieval store is configured."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-model",
    "reviewed_paths": [
      "packages/gateway/src/gateway.ts",
      "packages/gateway/src/completion.ts",
      "packages/gateway/src/types.ts",
      "apps/daemon/src/audit.ts",
      "apps/daemon/src/routing-model.ts",
      "apps/daemon/src/run-fix.ts",
      "apps/daemon/src/fix-execution.ts",
      "packages/diagnoser/src/diagnose.ts",
      "packages/diagnoser/src/context.ts",
      "packages/diagnoser/src/rules-only.ts",
      "apps/daemon/src/flow-harness.ts",
      "apps/daemon/src/flow-runtime.ts",
      "packages/gateway/src/audit.test.ts",
      "packages/diagnoser/src/prepared-evidence.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "packages/gateway/src/gateway.ts",
          "packages/gateway/src/completion.ts",
          "packages/gateway/src/types.ts",
          "apps/daemon/src/audit.ts",
          "apps/daemon/src/routing-model.ts",
          "apps/daemon/src/run-fix.ts",
          "apps/daemon/src/fix-execution.ts",
          "packages/gateway/src/audit.test.ts"
        ],
        "invariant": "A terminal model/fallback value must remain unavailable until the matching durable audit acknowledgment, and audit failure must not cause a second model or fallback decision.",
        "method": "source",
        "result": "Every decision reaches acknowledge once. It awaits the sink, verifies the exact random callId and withholds value on rejection or mismatch while retaining usage/cost. The production sink requires the bound audit Project, awaits the internal durable append and verifies the append key before acknowledging the call. Routing and Fix paths check audit scope before model use; observation binds the Event scope. An audit failure occurs after the single decision and cannot re-enter generation or fallback. Source test declarations cover failed/mismatched acknowledgments and all terminal statuses; they were read, not executed.",
        "artifact": null
      },
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "packages/diagnoser/src/diagnose.ts",
          "packages/diagnoser/src/context.ts",
          "packages/diagnoser/src/rules-only.ts",
          "apps/daemon/src/flow-harness.ts",
          "apps/daemon/src/flow-runtime.ts",
          "packages/diagnoser/src/prepared-evidence.test.ts"
        ],
        "invariant": "Rules-only diagnosis must quote the same prepared evidence as the model path and must not release raw secrets or bypass the audit decision.",
        "method": "source",
        "result": "The only production rulesOnly caller is diagnosis. It closes over the prepared ContextBundle, whose whole blocks are redacted before retained-line slicing. Rules-only signal/log excerpts come from that bundle rather than mutable raw inputs; the unknown fallback uses its prepared incident/signal. Fallback exceptions become fallback_unavailable, validator exceptions become validation_unavailable, and audit rejection withholds fallback output. flow-harness and FlowRuntime are explicitly in-memory test support, not production durable adapters. No fallback/audit integrity failure was found beyond the separately linked context-ownership candidates.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "model",
    "priority": 7,
    "priority_reason": "Untrusted context can influence privileged patch proposals; deterministic constraints, audit and budgets must hold.",
    "hardening_notes": [
      "packages/gateway/src/budget.ts documents per-process post-response counters. If operators require a strict daily spend ceiling across concurrent calls or restarts, reserve bounded call cost atomically and persist accounting. The current documented overshoot/restart ceiling alone was not reported as an unbounded delegated-loop finding.",
      "packages/agents/src/config.ts exposes allowedTools, but the active gateway adapters supply no callable tools. Keep that distinction explicit in configuration documentation and enforce the field if a callable-tool dispatcher is introduced.",
      "apps/daemon/src/private-http.ts response deadlines do not cancel durable Work commands; apps/daemon/src/command-lifetime.ts owns and drains that work. Expose or document a separate explicit cancellation operation if callers need to revoke a running attempt. Continued execution after the existing response timeout was not treated as an unrequested action."
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Detached%20work%20after%20cancellation",
    "canonical_refs": {
      "surface": "apps/daemon/src/routing-model.ts#routingModel",
      "boundary": "packages/gateway/src/gateway.ts#createGateway",
      "subsystem": "packages/gateway",
      "attack_class": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Detached work after cancellation"
    },
    "surface": "Prepared incident evidence, agent prompts, routing output and provider completions",
    "boundary": "Untrusted logs and model output to agent capabilities, accepted results, secrets and shared spend",
    "subsystem": "packages/gateway",
    "attack_class": "Provider cancellation and detached work",
    "starting_paths": [
      "packages/gateway/src",
      "packages/agents/src",
      "packages/diagnoser/src",
      "packages/redactor/src",
      "packages/config/src",
      "apps/daemon/src/model-context.ts",
      "apps/daemon/src/routing-model.ts",
      "apps/daemon/src/flow-harness.ts",
      "apps/daemon/src/flow-runtime.ts",
      "packages/notifier-discord/src"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Core discipline",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Detached work after cancellation",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Universal moves",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "This distinct ordinary class has a sibling unit in packages/gateway; this unit covers Provider cancellation and detached work."
      },
      {
        "block": "AI-AND-LLM.md#Persistent memory poisoning",
        "reason": "Gateway, diagnoser and routing modules consume per-task evidence; no independent persistent agent-memory writer/retrieval store is configured."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-model",
    "reviewed_paths": [
      "packages/gateway/src/gateway.ts",
      "packages/gateway/src/adapters.ts",
      "packages/gateway/src/types.ts",
      "apps/daemon/src/model-context.ts",
      "apps/daemon/src/routing-model.ts",
      "apps/daemon/src/run-fix.ts",
      "apps/daemon/src/fix-execution.ts",
      "apps/daemon/src/attempt-lifetime.ts",
      "packages/diagnoser/src/diagnose.ts",
      "apps/daemon/src/observations.ts",
      "apps/daemon/src/command-handler.ts",
      "apps/daemon/src/private-http.ts",
      "apps/daemon/src/command-lifetime.ts",
      "apps/daemon/src/command-handler.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "packages/gateway/src/gateway.ts",
          "packages/gateway/src/adapters.ts",
          "packages/gateway/src/types.ts",
          "apps/daemon/src/model-context.ts",
          "apps/daemon/src/routing-model.ts",
          "apps/daemon/src/run-fix.ts",
          "apps/daemon/src/fix-execution.ts",
          "apps/daemon/src/attempt-lifetime.ts",
          "packages/diagnoser/src/diagnose.ts",
          "apps/daemon/src/observations.ts"
        ],
        "invariant": "Explicit Fix-attempt cancellation must reach provider generation, prevent retries/fallback acceptance and stop the next privileged stage.",
        "method": "source",
        "result": "Lease renewal failure aborts the attempt controller. Routing obtains that signal from its frozen AsyncLocalStorage context; patch execution passes input.signal explicitly. The gateway combines it with an attempt timeout and forwards it as SDK abortSignal, with SDK retries disabled. It checks cancellation before dispatch, on caught errors and after response accounting, and does not choose rules-only fallback for cancellation. runOwnedFix checks cancellation around context, policy, routing, preparation and publication transitions. Event-driven diagnosis has no client cancellation contract but still receives the gateway timeout. No source-visible loss of the explicit attempt signal was found. This establishes signal wiring, not a claim about a remote provider stopping billing.",
        "artifact": null
      },
      {
        "agent_id": "hunt-model",
        "reviewed_paths": [
          "apps/daemon/src/command-handler.ts",
          "apps/daemon/src/private-http.ts",
          "apps/daemon/src/command-lifetime.ts",
          "apps/daemon/src/command-handler.test.ts"
        ],
        "invariant": "Work retained after a private HTTP response deadline must have an explicit lifecycle owner; a response timeout must not be mistaken for revoked action authority.",
        "method": "source",
        "result": "within races the response deadline without aborting the already authorized durable command. drainCommands tracks the original promise, rejects new commands during shutdown and awaits outstanding work. The source test explicitly expects a timed-out command to complete and shutdown to drain it. This is intentional continued execution of the same authorized command, rather than evidence that an explicit cancellation was ignored. No cross-principal action or unbounded model loop follows solely from that response timeout, so it was not promoted as an availability finding.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "model",
    "priority": 7,
    "priority_reason": "Untrusted context can influence privileged patch proposals; deterministic constraints, audit and budgets must hold.",
    "hardening_notes": [
      "packages/gateway/src/budget.ts documents per-process post-response counters. If operators require a strict daily spend ceiling across concurrent calls or restarts, reserve bounded call cost atomically and persist accounting. The current documented overshoot/restart ceiling alone was not reported as an unbounded delegated-loop finding.",
      "packages/agents/src/config.ts exposes allowedTools, but the active gateway adapters supply no callable tools. Keep that distinction explicit in configuration documentation and enforce the field if a callable-tool dispatcher is introduced.",
      "apps/daemon/src/private-http.ts response deadlines do not cancel durable Work commands; apps/daemon/src/command-lifetime.ts owns and drains that work. Expose or document a separate explicit cancellation operation if callers need to revoke a running attempt. Continued execution after the existing response timeout was not treated as an unrequested action."
    ]
  },
  {
    "coverage_id": "deploy%2Fcompose%2Fgraveshift.compose.yml%23services::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::CLOUD-AND-DEPLOYMENT.md%23Security-control%20precedence%20drift",
    "canonical_refs": {
      "surface": "deploy/compose/graveshift.compose.yml#services",
      "boundary": "scripts/actions/policy-signature.ts#verifyPolicySignature",
      "subsystem": ".github",
      "attack_class": "CLOUD-AND-DEPLOYMENT.md#Security-control precedence drift"
    },
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "subsystem": ".github",
    "attack_class": "Deployment security-control precedence",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "CLOUD-AND-DEPLOYMENT.md#Core discipline",
      "CLOUD-AND-DEPLOYMENT.md#Security-control precedence drift",
      "CLOUD-AND-DEPLOYMENT.md#Universal moves",
      "CLOUD-AND-DEPLOYMENT.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Deployment security-control precedence."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-supply-deploy",
    "reviewed_paths": [
      "graveshift.config.yaml",
      "examples/haunted-candy-shop/graveshift.config.yaml",
      "packages/config/src/load.ts",
      "packages/config/src/schema.ts",
      "apps/api/src/config/env.schema.ts",
      "apps/api/src/config/boot.config.ts",
      "apps/api/src/main.ts",
      "packages/policy/src/mode.ts",
      "packages/policy/src/evaluation.ts",
      "packages/policy/src/decide.ts",
      "packages/actuator/src/main.ts",
      "packages/actuator/src/claims.ts",
      ".kiro/agents/chaos-witch.json",
      "docs/DEMO.md",
      "deploy/compose/graveshift.compose.yml",
      "deploy/compose/demo.compose.yml",
      "examples/haunted-candy-shop/Dockerfile",
      "examples/haunted-candy-shop/src/api-main.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          "graveshift.config.yaml",
          "examples/haunted-candy-shop/graveshift.config.yaml",
          "packages/config/src/load.ts",
          "packages/config/src/schema.ts",
          "apps/api/src/config/env.schema.ts",
          "apps/api/src/config/boot.config.ts",
          "apps/api/src/main.ts",
          "packages/policy/src/mode.ts",
          "packages/policy/src/evaluation.ts",
          "packages/policy/src/decide.ts",
          "packages/actuator/src/main.ts",
          "packages/actuator/src/claims.ts"
        ],
        "invariant": "Deployment overrides must not silently widen configured policy mode, disable required startup credentials, or imply an audit guarantee absent from the launcher.",
        "method": "source",
        "result": "Both committed example/config policies select propose and disable automatic fixes. resolveMode only accepts a safer or equal mode, and runtime decisions consume that resolver. The actuator rejects a missing/short HMAC key and a failed durable admission store before listening. API environment validation rejects missing internal/JWT secrets and equal API/daemon tokens; main listens on the committed boot host after boot validation. The actuator launcher explicitly sets durableAudit:false and only acknowledges audit locally; this was not mistaken for a durable remote audit handoff or duplicated into the peer-owned actuator audit review. These source controls reject simple environment-mode and empty-secret bypass hypotheses.",
        "artifact": null
      },
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          ".kiro/agents/chaos-witch.json",
          "docs/DEMO.md",
          "deploy/compose/graveshift.compose.yml",
          "deploy/compose/demo.compose.yml",
          "examples/haunted-candy-shop/Dockerfile",
          "examples/haunted-candy-shop/src/api-main.ts"
        ],
        "invariant": "Composing the lower-trust watched demo with support services must preserve the separate platform API image, credential set and network membership.",
        "method": "source",
        "result": "docs/DEMO.md:20 combines the support file first and demo file second. Both declare services.api and services.postgres. Support api carries internal/JWT/root-bootstrap environment fields and core networking; demo api supplies the haunted image and example build context without resetting the inherited maps/lists. A contributor or declared examples-only writer can control that image's inputs. This supports a conditional credential/network inheritance candidate. The source also retains the API profile, platform command, and platform Dockerfile path, so the unchanged combined demo is not established runnable: the example has neither src/main.ts nor deploy/compose/bun.Dockerfile. Rendering and a minimal examples-only fixture were not executed, and no credential disclosure is claimed as observed.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "deploy/compose/api-service-overlay-retains-control-plane-authority"
    ],
    "unresolved": [
      "The exact effective combined Compose object and an active API-profile deployment with a runnable lower-trust example image have not been observed. The present unmodified overlay retains incompatible build/command fields; the candidate's runnable examples-only variant requires bounded validation.",
      "No complete OS-enforced memory and cumulative disk sandbox or artifact promotion is available, so configuration rendering and image/process validation were not performed."
    ],
    "assignment_group": "supply-deploy",
    "priority": 4,
    "priority_reason": "CI and deployment are parallel paths into source mutation, publication tokens and runtime network authority.",
    "hardening_notes": [
      "deploy/compose/bun.Dockerfile copies all apps/packages, while its Dockerfile-specific ignore uses root .env* rather than an explicit recursive nested-secret exclusion. Narrow release inputs or add recursive exclusions for local env/credential artifacts. No ignored secret was read, no actual credential-bearing nested file was established, and no image disclosure is claimed.",
      "apply-patch.ts:71-80 resolves BASE_REF in process.cwd() even though workflow writes and subsequent Git calls use PATCH_WORKSPACE=../target. Existing script fixtures use a single checkout, so they do not establish the two-directory workflow behavior. The source-visible effect is a possible safe publication failure, not a demonstrated unauthorized write.",
      "The documented combined Compose setup also collides on postgres and retains the API profile, command and Dockerfile fields. The unchanged combined run is not established functional. CI validates the two Compose files separately, so it does not settle combined-object behavior. These limitations are retained in the conditional candidate rather than hidden behind a presumed successful deployment.",
      "The actuator proxy's CONTAINERS=1, POST=1, ALLOW_RESTARTS=1 settings require inspection of the pinned external proxy's effective policy. The repository comment alone does not prove restart-only transport, and docker.sock:ro does not independently prevent write requests over a Unix socket. No arbitrary-operation exploit is claimed without a lower-trust source path.",
      "Kubernetes RBAC, permissive egress skeleton, Helm values and kind bootstrap are explicitly incomplete and have no workload attachment. Their broad reads or empty egress rule are dormant scaffold/hardening observations, not evidence of a live cluster or internet exposure.",
      "scripts/kiro/guard-shell.mjs is a substring regex guard, and secret-scan.mjs is post-save and permits unreadable files. They should be described as developer assistance rather than a shell sandbox, full secret prevention control, or publisher boundary. No same-user bypass was elevated to privilege gain.",
      "Mutable image tags, default local/test database placeholders and public-package metadata were not promoted into vulnerabilities without an actor-controlled handoff and affected lower-trust principal. All checks in this result are source inspection; project code, tests, builds, containers, cloud/GitHub commands, external requests and ignored local settings were not used."
    ]
  },
  {
    "coverage_id": "deploy%2Fcompose%2Fgraveshift.compose.yml%23services::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::CLOUD-AND-DEPLOYMENT.md%23Unexpected%20service%20or%20management-plane%20reachability",
    "canonical_refs": {
      "surface": "deploy/compose/graveshift.compose.yml#services",
      "boundary": "scripts/actions/policy-signature.ts#verifyPolicySignature",
      "subsystem": ".github",
      "attack_class": "CLOUD-AND-DEPLOYMENT.md#Unexpected service or management-plane reachability"
    },
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "subsystem": ".github",
    "attack_class": "Deployment management-plane reachability",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "CLOUD-AND-DEPLOYMENT.md#Core discipline",
      "CLOUD-AND-DEPLOYMENT.md#Unexpected service or management-plane reachability",
      "CLOUD-AND-DEPLOYMENT.md#Universal moves",
      "CLOUD-AND-DEPLOYMENT.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Deployment management-plane reachability."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-supply-deploy",
    "reviewed_paths": [
      "deploy/compose/graveshift.compose.yml",
      "deploy/compose/demo.compose.yml",
      "deploy/compose/database-test.yml",
      "deploy/compose/nats/nats.conf",
      "deploy/compose/prometheus.yml",
      "apps/api/src/main.ts",
      "packages/actuator/src/main.ts",
      "packages/actuator/src/handler.ts",
      "docs/DEMO.md",
      ".kiro/agents/chaos-witch.json",
      "examples/haunted-candy-shop/Dockerfile",
      "examples/haunted-candy-shop/src/api-main.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          "deploy/compose/graveshift.compose.yml",
          "deploy/compose/demo.compose.yml",
          "deploy/compose/database-test.yml",
          "deploy/compose/nats/nats.conf",
          "deploy/compose/prometheus.yml",
          "apps/api/src/main.ts",
          "packages/actuator/src/main.ts",
          "packages/actuator/src/handler.ts"
        ],
        "invariant": "Maintained base deployments must not publicly publish sensitive broker, Docker proxy, actuator or database management listeners.",
        "method": "source",
        "result": "Support API/Postgres, demo ports and database-test Postgres mappings explicitly bind 127.0.0.1. Neither Docker proxy, actuator, Prometheus nor NATS declares a host port. NATS has TLS and named users, binds its client listener inside the container, and places monitoring on 127.0.0.1:8222; protocol side listeners are absent. Only actuator joins the internal act network with its write proxy. The API boot host is loopback by current config; the actuator's network listener exposes health and a bounded actions adapter rather than an unauthenticated management console. This establishes declared base topology only, without inferring host firewalls or live reachability.",
        "artifact": null
      },
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          "docs/DEMO.md",
          ".kiro/agents/chaos-witch.json",
          "deploy/compose/graveshift.compose.yml",
          "deploy/compose/demo.compose.yml",
          "examples/haunted-candy-shop/Dockerfile",
          "examples/haunted-candy-shop/src/api-main.ts"
        ],
        "invariant": "The documented combined deployment must not attach lower-trust demo code to a platform-only network through a colliding service identity.",
        "method": "source",
        "result": "The same services.api collision also combines support core networking with demo candy networking while selecting the demo image/context. This is linked to the single authority-inheritance fingerprint rather than a separate finding. Its minimum candidate result is delivery of a dummy platform-secret marker to the lower-trust image; the additional effective core membership can be checked in the same rendered object. No arbitrary Docker operation, broker bypass, host exposure, or live management access was assumed. The retained API profile and incompatible platform Dockerfile/command remain prerequisites blocking an observed runnable result.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "deploy/compose/api-service-overlay-retains-control-plane-authority"
    ],
    "unresolved": [
      "The combined service's effective image, networks, retained API profile and runnable command/build inputs require bounded rendering and a minimal dummy example fixture. No such execution is authorized under the available sandbox controls."
    ],
    "assignment_group": "supply-deploy",
    "priority": 4,
    "priority_reason": "CI and deployment are parallel paths into source mutation, publication tokens and runtime network authority.",
    "hardening_notes": [
      "deploy/compose/bun.Dockerfile copies all apps/packages, while its Dockerfile-specific ignore uses root .env* rather than an explicit recursive nested-secret exclusion. Narrow release inputs or add recursive exclusions for local env/credential artifacts. No ignored secret was read, no actual credential-bearing nested file was established, and no image disclosure is claimed.",
      "apply-patch.ts:71-80 resolves BASE_REF in process.cwd() even though workflow writes and subsequent Git calls use PATCH_WORKSPACE=../target. Existing script fixtures use a single checkout, so they do not establish the two-directory workflow behavior. The source-visible effect is a possible safe publication failure, not a demonstrated unauthorized write.",
      "The documented combined Compose setup also collides on postgres and retains the API profile, command and Dockerfile fields. The unchanged combined run is not established functional. CI validates the two Compose files separately, so it does not settle combined-object behavior. These limitations are retained in the conditional candidate rather than hidden behind a presumed successful deployment.",
      "The actuator proxy's CONTAINERS=1, POST=1, ALLOW_RESTARTS=1 settings require inspection of the pinned external proxy's effective policy. The repository comment alone does not prove restart-only transport, and docker.sock:ro does not independently prevent write requests over a Unix socket. No arbitrary-operation exploit is claimed without a lower-trust source path.",
      "Kubernetes RBAC, permissive egress skeleton, Helm values and kind bootstrap are explicitly incomplete and have no workload attachment. Their broad reads or empty egress rule are dormant scaffold/hardening observations, not evidence of a live cluster or internet exposure.",
      "scripts/kiro/guard-shell.mjs is a substring regex guard, and secret-scan.mjs is post-save and permits unreadable files. They should be described as developer assistance rather than a shell sandbox, full secret prevention control, or publisher boundary. No same-user bypass was elevated to privilege gain.",
      "Mutable image tags, default local/test database placeholders and public-package metadata were not promoted into vulnerabilities without an actor-controlled handoff and affected lower-trust principal. All checks in this result are source inspection; project code, tests, builds, containers, cloud/GitHub commands, external requests and ignored local settings were not used."
    ]
  },
  {
    "coverage_id": "deploy%2Fk8s%2Frbac.yaml%23graveshift-actuator::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::CLOUD-AND-DEPLOYMENT.md%23Host%20or%20control-plane%20capability%20exposure",
    "canonical_refs": {
      "surface": "deploy/k8s/rbac.yaml#graveshift-actuator",
      "boundary": "scripts/actions/policy-signature.ts#verifyPolicySignature",
      "subsystem": ".github",
      "attack_class": "CLOUD-AND-DEPLOYMENT.md#Host or control-plane capability exposure"
    },
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "subsystem": ".github",
    "attack_class": "Container and cluster capability authority",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "CLOUD-AND-DEPLOYMENT.md#Core discipline",
      "CLOUD-AND-DEPLOYMENT.md#Host or control-plane capability exposure",
      "CLOUD-AND-DEPLOYMENT.md#Universal moves",
      "CLOUD-AND-DEPLOYMENT.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Container and cluster capability authority."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "blocked",
    "agent_id": "hunt-supply-deploy",
    "reviewed_paths": [
      "deploy/k8s/rbac.yaml",
      "deploy/k8s/kustomization.yaml",
      "deploy/k8s/networkpolicy.yaml",
      "deploy/helm/graveshift/Chart.yaml",
      "deploy/helm/graveshift/values.yaml",
      "deploy/kind/bootstrap.sh",
      "deploy/kind/kind-config.yaml",
      "deploy/compose/graveshift.compose.yml",
      "deploy/compose/demo.compose.yml",
      "deploy/compose/bun.Dockerfile",
      "packages/actuator/src/main.ts",
      "packages/actuator/src/backends.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          "deploy/k8s/rbac.yaml",
          "deploy/k8s/kustomization.yaml",
          "deploy/k8s/networkpolicy.yaml",
          "deploy/helm/graveshift/Chart.yaml",
          "deploy/helm/graveshift/values.yaml",
          "deploy/kind/bootstrap.sh",
          "deploy/kind/kind-config.yaml"
        ],
        "invariant": "A lower-trust workload must not receive active host or cluster-wide mutation authority from the maintained Kubernetes deployment path.",
        "method": "source",
        "result": "The reader ClusterRole grants get/list/watch; the actuator Role is confined to named api/worker deployments in candy-shop and worker scale. No cluster-admin, secrets resource, pod creation, hostPath or privileged pod is declared. Kustomization contains only RBAC and a permissive egress skeleton, with both workload manifests commented out; Helm has no templates and kind bootstrap performs no cluster commands. There is therefore no source-visible workload attachment making these scaffolds a live capability exposure. Broader ownership/label behavior in actuator backends belongs to the explicitly peer-owned unit and was not duplicated.",
        "artifact": null
      },
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          "deploy/compose/graveshift.compose.yml",
          "deploy/compose/demo.compose.yml",
          "deploy/compose/bun.Dockerfile",
          "packages/actuator/src/main.ts",
          "packages/actuator/src/backends.ts"
        ],
        "invariant": "The Docker socket transport must enforce the declared read-only observer and restart-only actuator capabilities without granting arbitrary host mutation to a lower-trust workload.",
        "method": "source",
        "result": "Only the two socket proxies mount docker.sock; application images run as bun, and demo workloads join candy rather than act in the separate base files. The reader proxy declares POST=0. The actuator proxy declares CONTAINERS=1, POST=1 and ALLOW_RESTARTS=1, and is attached to act with only the actuator. The application backend constructs only container lookup and restart endpoints. However, the repository does not contain the pinned tecnativa/docker-socket-proxy:0.3.0 authorization implementation, so the claim that these variables restrict every write to restart could not be checked. A read-only socket filesystem mount alone was not counted as a Docker API authorization control. No complete lower-trust arbitrary-operation trace was established, so this is a coverage blocker rather than a speculative vulnerability.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [
      "The effective HTTP method/path policy of tecnativa/docker-socket-proxy:0.3.0 under CONTAINERS=1, POST=1, ALLOW_RESTARTS=1 is outside repository source. External image/source requests and container execution are forbidden, and the complete OS sandbox is unavailable. A trusted owner must inspect that pinned image's policy or perform an isolated dummy-socket allow/deny check for restart versus create/exec/delete before restart-only transport coverage can be completed."
    ],
    "assignment_group": "supply-deploy",
    "priority": 4,
    "priority_reason": "CI and deployment are parallel paths into source mutation, publication tokens and runtime network authority.",
    "hardening_notes": [
      "deploy/compose/bun.Dockerfile copies all apps/packages, while its Dockerfile-specific ignore uses root .env* rather than an explicit recursive nested-secret exclusion. Narrow release inputs or add recursive exclusions for local env/credential artifacts. No ignored secret was read, no actual credential-bearing nested file was established, and no image disclosure is claimed.",
      "apply-patch.ts:71-80 resolves BASE_REF in process.cwd() even though workflow writes and subsequent Git calls use PATCH_WORKSPACE=../target. Existing script fixtures use a single checkout, so they do not establish the two-directory workflow behavior. The source-visible effect is a possible safe publication failure, not a demonstrated unauthorized write.",
      "The documented combined Compose setup also collides on postgres and retains the API profile, command and Dockerfile fields. The unchanged combined run is not established functional. CI validates the two Compose files separately, so it does not settle combined-object behavior. These limitations are retained in the conditional candidate rather than hidden behind a presumed successful deployment.",
      "The actuator proxy's CONTAINERS=1, POST=1, ALLOW_RESTARTS=1 settings require inspection of the pinned external proxy's effective policy. The repository comment alone does not prove restart-only transport, and docker.sock:ro does not independently prevent write requests over a Unix socket. No arbitrary-operation exploit is claimed without a lower-trust source path.",
      "Kubernetes RBAC, permissive egress skeleton, Helm values and kind bootstrap are explicitly incomplete and have no workload attachment. Their broad reads or empty egress rule are dormant scaffold/hardening observations, not evidence of a live cluster or internet exposure.",
      "scripts/kiro/guard-shell.mjs is a substring regex guard, and secret-scan.mjs is post-save and permits unreadable files. They should be described as developer assistance rather than a shell sandbox, full secret prevention control, or publisher boundary. No same-user bypass was elevated to privilege gain.",
      "Mutable image tags, default local/test database placeholders and public-package metadata were not promoted into vulnerabilities without an actor-controlled handoff and affected lower-trust principal. All checks in this result are source inspection; project code, tests, builds, containers, cloud/GitHub commands, external requests and ignored local settings were not used."
    ]
  },
  {
    "coverage_id": "package.json%23workspaces::apps%2Fapi%2Fsrc%2Fapp.factory.ts%23createApp::package.json%23workspaces::ATTACK-CLASSES.md%23Obvious%20things",
    "canonical_refs": {
      "surface": "package.json#workspaces",
      "boundary": "apps/api/src/app.factory.ts#createApp",
      "subsystem": "package.json#workspaces",
      "attack_class": "ATTACK-CLASSES.md#Obvious things"
    },
    "surface": "Workspace-wide configuration, runtime registration and unexpected fallback surfaces",
    "boundary": "External or lower-trust inputs to hidden, debug, secret or fallback authority",
    "subsystem": "package.json#workspaces",
    "attack_class": "Literal secret, debug, default and runtime exposure baseline",
    "starting_paths": [
      "apps",
      "packages",
      "scripts",
      "deploy",
      ".github",
      ".kiro",
      "powers",
      ".gitignore",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Obvious things",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Wildcard",
        "reason": "This distinct ordinary class has a sibling unit in package.json#workspaces; this unit covers Literal secret, debug, default and runtime exposure baseline."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "blocked",
    "agent_id": "hunt-baseline",
    "reviewed_paths": [
      ".env.example",
      ".github/actions/setup-bun/action.yml",
      ".github/dependabot.yml",
      ".github/workflows/ci.yml",
      ".github/workflows/codeql.yml",
      ".gitignore",
      ".kiro/settings/mcp.example.json",
      "apps/api/package.json",
      "apps/api/scripts/check-prisma-drift.ts",
      "apps/api/src/app.factory.ts",
      "apps/api/src/app.module.ts",
      "apps/api/src/auth/controllers/oauth.controller.ts",
      "apps/api/src/auth/env.schema.ts",
      "apps/api/src/auth/services/nats-event-publisher.ts",
      "apps/api/src/config/config.controller.ts",
      "apps/api/src/config/config.module.ts",
      "apps/api/src/config/env.schema.ts",
      "apps/api/src/dto/validate-rules.dto.ts",
      "apps/api/src/health.controller.ts",
      "apps/api/src/identity/controllers/account.controller.ts",
      "apps/api/src/identity/services/identity.service.ts",
      "apps/api/src/internal/internal-config.controller.ts",
      "apps/api/src/internal/internal.guard.ts",
      "apps/api/src/main.ts",
      "apps/api/src/mcp/mcp.module.ts",
      "apps/api/src/metadata.ts",
      "apps/api/src/rules.controller.ts",
      "apps/api/src/rules.service.ts",
      "apps/api/src/stdio.ts",
      "apps/api/src/work-items/work-error.filter.ts",
      "apps/api/test/openapi.e2e.test.ts",
      "apps/api/test/setup.ts",
      "apps/daemon/src/command-handler.ts",
      "apps/daemon/src/config.ts",
      "apps/daemon/src/fix-execution.ts",
      "apps/daemon/src/fix-recording.ts",
      "apps/daemon/src/read-handler.ts",
      "apps/daemon/src/routes.ts",
      "bun.lock",
      "bunfig.toml",
      "deploy/compose/bun.Dockerfile",
      "deploy/compose/bun.Dockerfile.dockerignore",
      "deploy/compose/demo.compose.yml",
      "deploy/compose/graveshift.compose.yml",
      "deploy/compose/nats/nats.conf",
      "deploy/helm/graveshift/values.yaml",
      "deploy/k8s/kustomization.yaml",
      "deploy/k8s/networkpolicy.yaml",
      "examples/haunted-candy-shop/.dockerignore",
      "examples/haunted-candy-shop/Dockerfile",
      "examples/haunted-candy-shop/graveshift.config.yaml",
      "examples/haunted-candy-shop/src/app.ts",
      "examples/haunted-candy-shop/src/candy-shop.test.ts",
      "examples/haunted-candy-shop/src/haunt.ts",
      "examples/haunted-candy-shop/src/metrics.ts",
      "examples/haunted-candy-shop/src/worker.ts",
      "graveshift.config.yaml",
      "package.json",
      "packages/actuator/src/handler.ts",
      "packages/actuator/src/main.ts",
      "packages/agents/package.json",
      "packages/agents/src/config.ts",
      "packages/api-contract/scripts/generate.ts",
      "packages/config/package.json",
      "packages/core/package.json",
      "packages/fixer/src/pr-body.ts",
      "packages/fixer/src/sandbox.ts",
      "packages/gateway/src/adapters.ts",
      "packages/mcp-client/scripts/drift-check.ts",
      "packages/notifier-discord/src/index.ts",
      "packages/work/src/errors.ts",
      "scripts/check-nats-config.ts",
      "scripts/test-database.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          ".env.example",
          ".kiro/settings/mcp.example.json",
          "graveshift.config.yaml",
          "examples/haunted-candy-shop/graveshift.config.yaml",
          "apps/api/src/auth/env.schema.ts",
          "apps/api/src/config/env.schema.ts",
          "packages/gateway/src/adapters.ts"
        ],
        "invariant": "Obvious 01: checked-in literal passwords, API keys, bearer values and private keys must not supply hidden production authentication authority.",
        "method": "source",
        "result": "Tracked-source keyword and common credential-signature searches covered apps, packages, scripts, deploy, .github, .kiro, powers, examples and the root configuration. Signature-shaped hits were synthetic tests, fixtures or detector expressions; no non-fixture production secret was identified. The allowed untracked example YAML also names environment variables rather than holding their values. .env.example:10-11,25-31,48-49,64 leaves authority-bearing values empty; .kiro/settings/mcp.example.json:14 is an explicit local placeholder. apps/api/src/auth/env.schema.ts:15-26 requires the JWT secret; apps/api/src/config/env.schema.ts:16-23,77-88,115 requires deployment secrets and rejects obvious placeholders. packages/gateway/src/adapters.ts:25-35,126-131 rejects missing or placeholder provider keys. Local database example defaults are addressed separately below. No real secret value is reproduced here.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "apps/api/src/dto/validate-rules.dto.ts",
          "deploy/k8s/kustomization.yaml",
          "deploy/k8s/networkpolicy.yaml",
          "deploy/helm/graveshift/values.yaml",
          "packages/notifier-discord/src/index.ts"
        ],
        "invariant": "Obvious 02: security-related TODO, FIXME, HACK or XXX comments must not conceal an active authentication or validation bypass.",
        "method": "source",
        "result": "A case-insensitive search for all four markers and their authentication, validation, permission, secret, TLS and sandbox variants found no security-marker bypass in active application code. apps/api/src/dto/validate-rules.dto.ts:15 says the public validator is bounded until authentication ships; its two arrays are limited to 200 entries at lines 16-34, and its stateless behavior is traced in the Wildcard unit. deploy/k8s/networkpolicy.yaml:13 leaves egress allowlisting unfinished, and deploy/k8s/kustomization.yaml:7-11 leaves application/actuator manifests disabled; these are explicit deployment scaffolds assigned to deployment peers. deploy/helm/graveshift/values.yaml:1 and packages/notifier-discord/src/index.ts:1 do not implement hidden runtime routes. No TODO alone was promoted to a finding.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "apps/api/src/app.factory.ts",
          "apps/api/src/auth/env.schema.ts",
          "apps/api/src/config/env.schema.ts",
          "apps/api/test/openapi.e2e.test.ts",
          "deploy/compose/bun.Dockerfile",
          "graveshift.config.yaml"
        ],
        "invariant": "Obvious 03: debug and development surfaces must not be switchable by lower-trust request headers or parameters.",
        "method": "source",
        "result": "apps/api/src/app.factory.ts:42-45 chooses Swagger registration once from ConfigService.NODE_ENV and closes it for normalized production/prod values. No request-controlled debug switch, inspector flag, debug controller or bypass environment variable was identified in the runtime-registration search. deploy/compose/bun.Dockerfile:5 sets production; graveshift.config.yaml:3-5 binds the direct development API to loopback. apps/api/src/config/env.schema.ts:59 declares the strict boot environment enum, while apps/api/src/auth/env.schema.ts:9 retains an older permissive schema; neither takes request input. apps/api/test/openapi.e2e.test.ts:53-70 contains production and mixed-case UI-closure assertions, read as source only. The test-only ConfigService.set hook at lines 13-17 is outside production startup.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "bunfig.toml",
          "apps/api/test/setup.ts",
          "packages/api-contract/scripts/generate.ts",
          "apps/api/src/auth/env.schema.ts",
          "apps/api/src/config/config.module.ts",
          "apps/api/src/config/env.schema.ts",
          "apps/api/src/main.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "examples/haunted-candy-shop/src/haunt.ts",
          "examples/haunted-candy-shop/src/candy-shop.test.ts",
          "deploy/compose/graveshift.compose.yml",
          ".github/workflows/ci.yml",
          "scripts/check-nats-config.ts"
        ],
        "invariant": "Obvious 04: test, example and seed credentials must not be installed as default production identities or remote bypass credentials.",
        "method": "source",
        "result": "bunfig.toml:1-2 loads apps/api/test/setup.ts only under the test configuration; runtime start commands do not import that setup. packages/api-contract/scripts/generate.ts:8-22 supplies random ephemeral authentication values and closes the generated app without listening. apps/api/src/main.ts:9-14 connects and completes identity bootstrap before listening. IdentityService.bootstrap at apps/api/src/identity/services/identity.service.ts:49-62 uses only configured root credentials, only for an empty account store, hashes the password and requires a password change. The four root settings are optional together and have no credential default at apps/api/src/config/env.schema.ts:73-76,128-144. The older auth schema has a local database placeholder at apps/api/src/auth/env.schema.ts:10-14; RootConfigModule also registers the stronger root schema at apps/api/src/config/config.module.ts:28. The Compose database placeholder at deploy/compose/graveshift.compose.yml:109-116 is an actual local store default with a loopback publication, not a hidden API account. CI and scripts/check-nats-config.ts use explicitly dummy broker values in configuration checks. Demo fault-token defaults are empty and tokenMatches fails closed at examples/haunted-candy-shop/src/haunt.ts:5-11. No production importer of the test credentials was found.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "apps/api/src/app.module.ts",
          "apps/api/src/health.controller.ts",
          "apps/api/src/config/config.controller.ts",
          "apps/api/src/internal/internal-config.controller.ts",
          "apps/api/src/internal/internal.guard.ts",
          "apps/api/src/mcp/mcp.module.ts",
          "apps/api/src/rules.controller.ts",
          "apps/api/src/rules.service.ts",
          "apps/api/src/dto/validate-rules.dto.ts",
          "apps/daemon/src/routes.ts",
          "packages/actuator/src/handler.ts",
          "examples/haunted-candy-shop/src/app.ts",
          "examples/haunted-candy-shop/src/worker.ts",
          "examples/haunted-candy-shop/src/metrics.ts"
        ],
        "invariant": "Obvious 05: public debug, administrative, test, status, health, metrics, environment and configuration routes must not expose hidden authority or secrets.",
        "method": "source",
        "result": "Controller annotations, AppModule imports and handwritten Bun routers were inventoried. API health returns only status at apps/api/src/health.controller.ts:8-14. Daemon health is similarly constant at apps/daemon/src/routes.ts:6-15; its private branches dispatch to their authenticated handlers at lines 22-27. The actuator exposes constant health and the signed-action handler, not an unauthenticated management console, at packages/actuator/src/handler.ts:29-46. Config export has throttling and an OAuth guard at apps/api/src/config/config.controller.ts:30; internal config has InternalGuard at apps/api/src/internal/internal-config.controller.ts:8-10, which checks the required token at apps/api/src/internal/internal.guard.ts:16-23. MCP HTTP registration pairs bearer/scope guards at apps/api/src/mcp/mcp.module.ts:81-90; deeper scope behavior remains peer-owned. The anonymous rules endpoint computes a caller-supplied validation result without persistence. Demo /metrics returns request statistics, RSS and application counters at examples/haunted-candy-shop/src/metrics.ts:27-45; fault mutations separately require configured tokens. No /debug, /admin, /test, /env, /.env, directory-static-file middleware or unauthenticated config route was found.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          ".gitignore",
          ".env.example"
        ],
        "invariant": "Obvious 06: tracked .env files, credential JSON files and private-key files must not carry deployable secrets.",
        "method": "source",
        "result": "Git's tracked-path inventory for .env variants, credentials.json, *.pem and *.key returned only .env.example; no tracked secret-bearing file of the other requested forms was present. The example contains empty authority-bearing values and explicitly marked local placeholders. A name-only search of available Git history also found no committed .env, .env.local, .env.production, PEM, key or credentials.json path under the searched forms. Ignored target-local environment and MCP settings files were not opened. This is a source-inventory result, not a claim about external secret stores or all possible secret encodings.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          ".gitignore",
          "deploy/compose/bun.Dockerfile.dockerignore",
          "examples/haunted-candy-shop/.dockerignore"
        ],
        "invariant": "Obvious 07: ignore rules must cover expected environment secrets and local settings, and gaps must be distinguished from an actual exposed file.",
        "method": "source",
        "result": ".gitignore:8-11 excludes .graveshift, .env and .env variants while retaining .env.example; lines 16-17 exclude the two local Kiro MCP settings files. The runtime Docker ignore file excludes .env* and .kiro at deploy/compose/bun.Dockerfile.dockerignore:3-4; the example Docker ignore also excludes .env*. Generic *.pem, *.key, credentials.json, uploads and arbitrary local YAML are not covered by the root ignore rules. No committed key file or HTTP upload/static-file exposure was established, so those omissions are hardening rather than a demonstrated disclosure.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "package.json",
          "apps/api/package.json",
          "packages/config/package.json",
          "packages/core/package.json",
          "packages/agents/package.json",
          "bun.lock",
          ".github/actions/setup-bun/action.yml",
          ".github/workflows/ci.yml",
          ".github/dependabot.yml",
          ".github/workflows/codeql.yml",
          "deploy/compose/bun.Dockerfile",
          "deploy/compose/graveshift.compose.yml",
          "examples/haunted-candy-shop/Dockerfile"
        ],
        "invariant": "Obvious 08: dependency versions and installed resolution must be identifiable, and current known-vulnerability status must not be asserted without advisory evidence.",
        "method": "source",
        "result": "package.json:6 pins Bun; API direct third-party dependencies are exact versions at apps/api/package.json:31-52. Some library manifests retain SemVer ranges, including packages/config/package.json:17, packages/agents/package.json:16 and packages/core/package.json:50. bun.lock records exact workspace/dependency resolutions and integrity hashes; examples include Express 5.3.0 at line 1010, jsonwebtoken 9.0.3 at line 1146, qs 6.17.1 at line 1296 and undici 8.12.4 at line 1422. .github/actions/setup-bun/action.yml:11 and deploy/compose/bun.Dockerfile:9 require frozen installs; checked workflow actions use commit SHAs and container references use version tags. Dependabot configuration at .github/dependabot.yml:1-58 and CodeQL configuration at .github/workflows/codeql.yml:21-33 are present, but are not an advisory result. No current local advisory snapshot was supplied. External advisory requests and package-manager execution are prohibited, so current CVE applicability remains unresolved and this unit is blocked rather than declared clean.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "apps/api/src/metadata.ts",
          "packages/mcp-client/scripts/drift-check.ts",
          "packages/fixer/src/sandbox.ts",
          "apps/daemon/src/fix-execution.ts",
          "apps/daemon/src/fix-recording.ts",
          "apps/api/scripts/check-prisma-drift.ts",
          "scripts/test-database.ts",
          "scripts/check-nats-config.ts"
        ],
        "invariant": "Obvious 09: dynamic evaluation, imports and process execution must not introduce an unassigned request-controlled hidden execution path.",
        "method": "source",
        "result": "The source search found no JavaScript eval, new Function or vm.run path. RegExp.exec and fixed SQLite transaction strings were separated from OS execution hits. Real process sinks exist: packages/fixer/src/sandbox.ts:45-54 executes argv with an explicit environment after the isolation selection/probe at lines 151-210; apps/daemon/src/fix-execution.ts:193-195,220-224 obtains verification argv from operator configuration. Their untrusted-repository and verification authority boundaries are assigned to fixer peers and were not re-hunted. apps/daemon/src/fix-recording.ts:10-24 is imported by fixture code rather than the production launcher. Metadata imports at apps/api/src/metadata.ts:13-15 come from the local controller tree; drift-check imports at packages/mcp-client/scripts/drift-check.ts:16-24 use three fixed filenames. The remaining inspected Bun.spawn sites are local maintenance/test scripts with constructed argv. One-shot workflow process sinks remain with the workflow peers. No new remotely selected evaluation or fallback command was identified.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "apps/api/src/app.factory.ts",
          "apps/api/src/app.module.ts",
          "apps/api/src/mcp/mcp.module.ts"
        ],
        "invariant": "Obvious 10: application CORS configuration must not combine wildcard or reflected origins with credentialed cross-origin access.",
        "method": "source",
        "result": "A tracked-source search for CORS, enableCors and Access-Control-Allow headers found no application CORS registration or wildcard/credential header assignment. apps/api/src/app.factory.ts:12-47 installs raw-body handling, DTO validation and the environment-gated Swagger UI without enabling CORS; apps/api/src/app.module.ts:34-77 adds no such middleware. MCP's registration at apps/api/src/mcp/mcp.module.ts:78-94 adds authentication decorators rather than a custom origin policy. This settles the literal application-header check; behavior added by an external proxy or dependency is not inferred from source.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "apps/api/src/identity/controllers/account.controller.ts",
          "apps/api/src/identity/services/identity.service.ts",
          "apps/api/src/auth/controllers/oauth.controller.ts",
          "apps/api/src/app.factory.ts"
        ],
        "invariant": "Obvious 11: security-sensitive application cookies must have appropriate HttpOnly, Secure and SameSite handling.",
        "method": "source",
        "result": "No application Set-Cookie, cookie setter, cookie parser or cookie-session registration was found. Account login returns an access_token JSON object through apps/api/src/identity/controllers/account.controller.ts:47-52 and apps/api/src/identity/services/identity.service.ts:90-105. OAuth similarly returns bearer JSON at apps/api/src/auth/controllers/oauth.controller.ts:28-34. apps/api/src/app.factory.ts configures no cookie middleware. Cookie attribute findings are therefore not applicable to the application-managed authentication paths reviewed; bearer transport and session semantics remain the corresponding peers' boundaries.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "apps/api/src/app.factory.ts",
          "apps/api/src/identity/controllers/account.controller.ts",
          "apps/api/src/auth/controllers/oauth.controller.ts",
          "packages/fixer/src/pr-body.ts",
          "apps/daemon/src/config.ts"
        ],
        "invariant": "Obvious 12: redirect, return, next, url, goto and continue inputs must not feed an unchecked redirect response.",
        "method": "source",
        "result": "The source search found no application response.redirect, Location-header redirect or redirect_uri/returnUrl handler accepting these inputs. The account and OAuth controllers return JSON. The dashboard URL use at packages/fixer/src/pr-body.ts:15-35 builds a Markdown link, rejects credentials and non-HTTP(S) protocols, encodes the incident path and clears query/fragment; it is not an HTTP redirect endpoint. Internal origins at apps/daemon/src/config.ts:21-32 reject credentials, query and fragment and do not consume request redirect parameters. No lower-trust open-redirect path was identified.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "apps/api/src/main.ts",
          "graveshift.config.yaml",
          "examples/haunted-candy-shop/graveshift.config.yaml",
          "apps/daemon/src/config.ts",
          "packages/actuator/src/main.ts",
          "deploy/compose/graveshift.compose.yml",
          "deploy/compose/demo.compose.yml",
          "deploy/compose/nats/nats.conf",
          "packages/agents/src/config.ts"
        ],
        "invariant": "Obvious 13: identify HTTP-only credential paths and establish their source-visible routing limits without assuming external TLS termination.",
        "method": "source",
        "result": "The API and actuator launchers create HTTP listeners without in-process TLS at apps/api/src/main.ts:14 and packages/actuator/src/main.ts:80-84. Both supplied Graveshift YAML files bind the direct API to 127.0.0.1. Daemon configuration explicitly requires a loopback HTTP origin at apps/daemon/src/config.ts:21-32. Support Compose publishes API/Postgres only on loopback at deploy/compose/graveshift.compose.yml:104,116 and publishes no actuator host port; demo ports are loopback at deploy/compose/demo.compose.yml:25,47. NATS declares mounted TLS material at deploy/compose/nats/nats.conf:15-19. Agent base URLs must be HTTPS without URL credentials at packages/agents/src/config.ts:71-74. Source therefore establishes local HTTP endpoints, not universal TLS enforcement. No off-host plaintext bearer exposure was established from the default routes; any alternative proxy/remote deployment assessment belongs to the assigned deployment and credential-transport peers.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "apps/api/src/main.ts",
          "apps/api/src/stdio.ts",
          "apps/api/src/app.factory.ts",
          "apps/api/src/work-items/work-error.filter.ts",
          "packages/work/src/errors.ts",
          "apps/daemon/src/command-handler.ts",
          "apps/daemon/src/read-handler.ts",
          "examples/haunted-candy-shop/src/app.ts",
          "packages/actuator/src/handler.ts",
          "apps/api/src/auth/services/nats-event-publisher.ts"
        ],
        "invariant": "Obvious 14: production error responses must not deliberately return exception stacks, host paths, SQL text or populated secret values.",
        "method": "source",
        "result": "No application response path explicitly serializes Error.stack or a raw Prisma exception. API startup emits a fixed message at apps/api/src/main.ts:21-23; stdio startup writes its error only to the trusted local process stderr at apps/api/src/stdio.ts:14-16. Known work errors are reduced to code/status/message at packages/work/src/errors.ts:54-55 and apps/api/src/work-items/work-error.filter.ts:4-10. Daemon unknown command/read failures use fixed 502 messages at apps/daemon/src/command-handler.ts:62-66 and apps/daemon/src/read-handler.ts:100-103. The demo catches exceptions and returns a fixed 500 at examples/haunted-candy-shop/src/app.ts:63-65; the actuator emits selected result fields at packages/actuator/src/handler.ts:57-64. One application-controlled exception merits hardening: apps/api/src/auth/services/nats-event-publisher.ts:34-39 places a connector error.message in a public ServiceUnavailableException. No source-proven case populating that message with a secret, SQL statement or host path was established, so it is not a disclosure candidate. Default framework and deployed error rendering were not executed or asserted as observed behavior.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [
      "Obvious 08 remains incomplete: current CVE/GHSA/OSV applicability to the exact bun.lock resolutions and container versions cannot be established from the supplied source. No current offline advisory snapshot is available, external requests are prohibited, and no package-manager audit command may be run. A trusted parent or owner can compare the locked versions with a dated advisory export without executing the project. No vulnerable dependency or severity is asserted."
    ],
    "assignment_group": "baseline",
    "priority": 8,
    "priority_reason": "A separate literal baseline and anomaly pass checks unassigned exposure patterns across the complete source inventory.",
    "hardening_notes": [
      ".gitignore:8-17 covers environment variants and local MCP settings but lacks generic private-key, credential-JSON, uploads and alternate local-config patterns. Add narrowly chosen patterns with explicit exceptions for intended fixtures; no committed key file or upload disclosure was established.",
      "Consolidate apps/api/src/auth/env.schema.ts and apps/api/src/auth/auth.config.module.ts with the root env/config definitions in apps/api/src/config/config.module.ts and apps/api/src/config/env.schema.ts. The old database default and duplicate auth providers make precedence harder to assess, although no request-controlled fallback or default JWT secret was found.",
      "apps/api/src/auth/services/nats-event-publisher.ts:34-39 reflects connector error.message in a ServiceUnavailableException. Prefer a fixed client-facing broker-unavailable message with separately controlled diagnostics. A populated sensitive connector error was not established, so this is not a disclosure finding.",
      "Direct API and actuator launchers do not enforce TLS themselves. Preserve the source-visible loopback/private publication model, and specify TLS termination when an operator chooses an off-host public binding. No off-host plaintext credential exposure was established from the supplied defaults.",
      "Review the stray tracked symlinks packages/agents/agents and packages/core/core, which point outside the repository. They were not followed and no runtime/export consumer was identified; their current presence is a source-hygiene issue rather than a demonstrated boundary violation."
    ]
  },
  {
    "coverage_id": "package.json%23workspaces::apps%2Fapi%2Fsrc%2Fapp.factory.ts%23createApp::package.json%23workspaces::ATTACK-CLASSES.md%23Wildcard",
    "canonical_refs": {
      "surface": "package.json#workspaces",
      "boundary": "apps/api/src/app.factory.ts#createApp",
      "subsystem": "package.json#workspaces",
      "attack_class": "ATTACK-CLASSES.md#Wildcard"
    },
    "surface": "Workspace-wide configuration, runtime registration and unexpected fallback surfaces",
    "boundary": "External or lower-trust inputs to hidden, debug, secret or fallback authority",
    "subsystem": "package.json#workspaces",
    "attack_class": "Unassigned source anomalies and fallback security boundaries",
    "starting_paths": [
      "apps",
      "packages",
      "scripts",
      "deploy",
      ".github",
      ".kiro",
      "powers",
      ".gitignore",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Wildcard",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Obvious things",
        "reason": "This distinct ordinary class has a sibling unit in package.json#workspaces; this unit covers Unassigned source anomalies and fallback security boundaries."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-baseline",
    "reviewed_paths": [
      ".env.example",
      ".kiro/agents/chaos-witch.json",
      ".kiro/agents/docs-scribe.json",
      ".kiro/agents/sre-reviewer.json",
      ".kiro/hooks/block-dangerous-shell.json",
      ".kiro/hooks/pbt-on-guardrails.json",
      ".kiro/hooks/secret-scan-on-save.json",
      ".kiro/hooks/typecheck-on-save.json",
      ".kiro/settings/mcp.example.json",
      "apps/api/package.json",
      "apps/api/src/app.factory.ts",
      "apps/api/src/app.module.ts",
      "apps/api/src/auth/auth.config.module.ts",
      "apps/api/src/auth/auth.config.ts",
      "apps/api/src/auth/env.schema.ts",
      "apps/api/src/config/boot.config.ts",
      "apps/api/src/config/config.module.ts",
      "apps/api/src/config/config.provider.ts",
      "apps/api/src/config/env.schema.ts",
      "apps/api/src/dto/rule.dto.ts",
      "apps/api/src/dto/validate-rules.dto.ts",
      "apps/api/src/main.ts",
      "apps/api/src/mcp/mcp.module.ts",
      "apps/api/src/metadata.ts",
      "apps/api/src/rules.controller.ts",
      "apps/api/src/rules.service.ts",
      "apps/api/src/stdio.ts",
      "apps/api/test/rules-validate.e2e.test.ts",
      "apps/api/test/setup.ts",
      "apps/daemon/src/boot-config.ts",
      "apps/daemon/src/fix-recording.ts",
      "apps/daemon/src/main.ts",
      "apps/daemon/src/platform.fixture.ts",
      "apps/daemon/src/routes.ts",
      "bunfig.toml",
      "deploy/compose/demo.compose.yml",
      "deploy/helm/graveshift/values.yaml",
      "deploy/k8s/kustomization.yaml",
      "examples/haunted-candy-shop/graveshift.config.yaml",
      "examples/haunted-candy-shop/package.json",
      "examples/haunted-candy-shop/src/app.ts",
      "examples/haunted-candy-shop/src/candy-shop.test.ts",
      "examples/haunted-candy-shop/src/config.ts",
      "examples/haunted-candy-shop/src/db.ts",
      "examples/haunted-candy-shop/src/haunt.ts",
      "examples/haunted-candy-shop/src/worker.ts",
      "graveshift.config.yaml",
      "package.json",
      "packages/actuator/src/handler.ts",
      "packages/actuator/src/main.ts",
      "packages/agents/agents",
      "packages/agents/package.json",
      "packages/api-contract/scripts/generate.ts",
      "packages/config/src/load.ts",
      "packages/config/src/schema.ts",
      "packages/core/core",
      "packages/core/package.json",
      "packages/core/src/rules.ts",
      "packages/mcp-client/scripts/drift-check.ts",
      "packages/notifier-discord/src/index.ts",
      "packages/policy/src/mode.ts",
      "powers/graveshift/mcp.json",
      "powers/graveshift/plugin.json",
      "scripts/kiro/guard-shell.mjs",
      "scripts/kiro/secret-scan.mjs"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "package.json",
          "apps/api/package.json",
          "apps/api/src/app.module.ts",
          "apps/api/src/app.factory.ts",
          "apps/api/src/main.ts",
          "apps/api/src/stdio.ts",
          "apps/api/src/mcp/mcp.module.ts",
          "apps/daemon/src/main.ts",
          "apps/daemon/src/routes.ts",
          "packages/actuator/src/main.ts",
          "packages/actuator/src/handler.ts",
          "powers/graveshift/mcp.json",
          "powers/graveshift/plugin.json",
          ".kiro/settings/mcp.example.json"
        ],
        "invariant": "Unadvertised, compatibility and alternate entrypoints must not create a runtime authority path outside the declared API, private daemon and signed actuator registrations.",
        "method": "source",
        "result": "Root workspaces are limited to apps/api, apps/daemon and packages/* at package.json:7-10. apps/api/package.json:7-8 starts main or the explicit local stdio context. HTTP main uses createApp and completes bootstrap before listen; AppModule lists the controller/modules that are registered. MCP's HTTP registration carries the guard decorators at apps/api/src/mcp/mcp.module.ts:81-90, while apps/api/src/stdio.ts:6-11 deliberately uses an application context with no HTTP listener. powers/graveshift/mcp.json:4-5 and .kiro/settings/mcp.example.json:19-20 select that same stdio command, not a separate legacy server. The plugin's 'not functional' description is stale registration documentation, not a runtime security gate. apps/daemon/src/routes.ts:22-27 exposes only the two private branches and constant health; the actuator router selects health or POST /actions. No additional hidden admin/debug listener or fallback authentication transport was found. Deep HTTP/MCP, local-IPC and actuator authorization invariants remain with their named peers.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "apps/api/src/rules.controller.ts",
          "apps/api/src/rules.service.ts",
          "apps/api/src/dto/validate-rules.dto.ts",
          "apps/api/src/dto/rule.dto.ts",
          "packages/core/src/rules.ts",
          "apps/api/test/rules-validate.e2e.test.ts"
        ],
        "invariant": "The unguarded rule-confirmation API must not use caller-supplied systemRules or confirmOverrides to modify effective policy or another principal's stored rules.",
        "method": "source",
        "result": "Traced POST /api/rules/validate at apps/api/src/rules.controller.ts:22-34 through RulesService.validate at apps/api/src/rules.service.ts:9-13 to confirmRuleOverrides/detectRuleOverrides at packages/core/src/rules.ts:47-57,123-135. Both systemRules and clientRules belong entirely to the request; the functions build a Set, return sorted matching IDs and construct a warning. No repository, gateway, audit, policy writer, filesystem writer or downstream action is called. DTO validation bounds each layer to 200 rules at apps/api/src/dto/validate-rules.dto.ts:16-34, validates nested fields and requires a boolean confirmation when supplied. Changing confirmation only changes the 200/409 validation result. The source tests at apps/api/test/rules-validate.e2e.test.ts:109-132,142-190 exercise no-write semantics, count limits, unknown fields and nulls. This anomaly is a stateless public helper, not an authorization bypass or a source-demonstrated shared-availability failure.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "examples/haunted-candy-shop/package.json",
          "examples/haunted-candy-shop/src/app.ts",
          "examples/haunted-candy-shop/src/haunt.ts",
          "examples/haunted-candy-shop/src/config.ts",
          "examples/haunted-candy-shop/src/db.ts",
          "examples/haunted-candy-shop/src/worker.ts",
          "examples/haunted-candy-shop/src/candy-shop.test.ts",
          "deploy/compose/demo.compose.yml"
        ],
        "invariant": "Fault-injection and memory/database fallback features must not allow an anonymous caller to mutate demo runtime state or select an arbitrary host resource.",
        "method": "source",
        "result": "The demo is a separate non-workspace package with explicit API/worker launchers at examples/haunted-candy-shop/package.json:9-14. createHaunt checks the method/path and configured token before parsing or applying a scenario at examples/haunted-candy-shop/src/haunt.ts:23-46; empty tokens deny at lines 5-6. Reset uses OWNER_TOKEN, while fault injection uses HAUNT_TOKEN. The requested scenario must match the fixed list at examples/haunted-candy-shop/src/config.ts:1-11. The database swap selects only operator-supplied normal/stale URLs at lines 15-20, and the memory database fallback contains fixed demo candies at examples/haunted-candy-shop/src/db.ts:18-43. The retaining worker buffer grows only after the authorized memory-leech scenario at examples/haunted-candy-shop/src/worker.ts:21-23. Test-source cases at examples/haunted-candy-shop/src/candy-shop.test.ts:35-57 include missing/wrong tokens and owner-only reset. The Compose file supplies no fault-token default and publishes the API/worker on loopback at deploy/compose/demo.compose.yml:19-20,25,47. These intentional authorized faults do not establish a hidden production control path.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "packages/config/src/load.ts",
          "packages/config/src/schema.ts",
          "apps/api/src/config/config.module.ts",
          "apps/api/src/config/config.provider.ts",
          "apps/api/src/config/boot.config.ts",
          "apps/api/src/config/env.schema.ts",
          "apps/api/src/auth/env.schema.ts",
          "apps/api/src/auth/auth.config.module.ts",
          "apps/api/src/auth/auth.config.ts",
          "graveshift.config.yaml",
          "examples/haunted-candy-shop/graveshift.config.yaml",
          ".env.example"
        ],
        "invariant": "Compatibility configuration and environment fallbacks must not let a request select local files, resolve secret values into exported configuration or weaken frozen operator authority.",
        "method": "source",
        "result": "packages/config/src/load.ts:14-27 selects the committed default file or the operator's GRAVESHIFT_CONFIG_PATH and parses it once; no request parameter is involved. The root object and boot/fix objects are strict at packages/config/src/schema.ts:10-15,17-43,66-75. GraveshiftConfigModule loads/freezeDeep at apps/api/src/config/config.module.ts:14-18, with recursive freezing in apps/api/src/config/config.provider.ts:5-10; RootBootConfig is separately frozen at apps/api/src/config/boot.config.ts:34-40,60-74. API keys and GitHub keys remain environment-variable names in both reviewed YAML files and in the schema, not resolved values. Older auth env/config/provider definitions coexist with RootConfigModule and merit cleanup, but both auth provider factories only read the configured JWT secret, neither substitutes a default key, and no lower-trust selector can choose between them. The local database default is an operator-bootstrap concern rather than a remotely set fallback. No config mutation or secret-resolution bypass was established; detailed config-export scope behavior was left with its peer owner.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "bunfig.toml",
          "apps/api/test/setup.ts",
          "packages/api-contract/scripts/generate.ts",
          "apps/api/src/metadata.ts",
          "packages/mcp-client/scripts/drift-check.ts",
          "apps/daemon/src/fix-recording.ts",
          "apps/daemon/src/platform.fixture.ts",
          "package.json",
          "packages/agents/agents",
          "packages/core/core",
          "packages/agents/package.json",
          "packages/core/package.json"
        ],
        "invariant": "Disconnected test implementations, generated-metadata helpers and stray source links must not become hidden production code or source readers.",
        "method": "source",
        "result": "Production import searches did not connect test setup, fake identity/credential adapters or githubRecording/gitChecks to runtime launchers. The recording helpers are used by apps/daemon/src/platform.fixture.ts:12,47,106. Metadata imports are restricted to the local controller-tree enumeration at apps/api/src/metadata.ts:13-15; drift-check enumerates three literal modules at packages/mcp-client/scripts/drift-check.ts:16-24. The contract-generation helper sets random temporary keys and never listens at packages/api-contract/scripts/generate.ts:8-22. Git records packages/agents/agents and packages/core/core as symlinks pointing outside the repository; their link contents were inspected with git show without following them. Workspace discovery at package.json:7-10 and explicit exports at packages/agents/package.json:6-10 and packages/core/package.json:29-40 do not select those nested links, and core's published file list at lines 8-19 omits them. No runtime consumer of the stray links was identified. Their presence is repository hygiene, not an established file-disclosure or authority path.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          "packages/policy/src/mode.ts",
          "graveshift.config.yaml",
          "apps/api/src/config/env.schema.ts",
          "apps/daemon/src/boot-config.ts",
          "apps/daemon/src/main.ts",
          "packages/actuator/src/main.ts",
          "deploy/helm/graveshift/values.yaml",
          "deploy/k8s/kustomization.yaml",
          "packages/notifier-discord/src/index.ts",
          "powers/graveshift/plugin.json"
        ],
        "invariant": "Invalid mode, unavailable optional components and incomplete scaffolds must not silently enable a stronger runtime capability or alternate approval collector.",
        "method": "source",
        "result": "packages/policy/src/mode.ts:3-20 orders dry-run/propose/act, preserves policy mode for an unknown override and refuses an override with greater authority. The committed config defaults to propose and fix.enabled false at graveshift.config.yaml:62,105-106. API boot defaults model spending to zero at apps/api/src/config/env.schema.ts:106-113. Daemon boot reads authenticated API configuration and refuses startup with no granted Project at apps/daemon/src/boot-config.ts:21-23 and apps/daemon/src/main.ts:41-47. The actuator refuses missing/short HMAC configuration at packages/actuator/src/main.ts:19-25 and unavailable durable admission at lines 49-65; its local audit acknowledgement limitation is explicit at lines 38-41,71 and remains with the actuator peer. Helm/Kubernetes files are marked scaffold and do not include a Deployment; packages/notifier-discord/src/index.ts implements no approval listener. No hidden Discord approval, model fallback with elevated mode, or executable Helm fallback was identified. Full action approval, budget concurrency and publication recovery were not duplicated from peer assignments.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          ".env.example",
          "apps/api/src/auth/env.schema.ts",
          "apps/api/src/app.factory.ts",
          "scripts/kiro/secret-scan.mjs"
        ],
        "invariant": "Available history and security-tool remnants must not reveal a removed production secret or a reverted security gate that still supplies current hidden authority.",
        "method": "source",
        "result": "Read the current/recent commit subjects and performed name-only history searches for committed environment, credential JSON and key files; none of those secret-file forms was found. A history search for common key signatures and hardcoded-secret changes returned synthetic fixture/detector files and the JWT environment-schema hardening, not a source-established retired production credential. Revert-related subjects found an unrelated contrast-helper revert/reapply and test/refactor history; no current runtime security bypass was established from them. The current JWT schema still requires a configured key at apps/api/src/auth/env.schema.ts:15-26 and current Swagger registration still gates production at apps/api/src/app.factory.ts:42-45. This was a bounded source/history inspection, not a claim that every historical byte or external credential is safe.",
        "artifact": null
      },
      {
        "agent_id": "hunt-baseline",
        "reviewed_paths": [
          ".kiro/agents/chaos-witch.json",
          ".kiro/agents/docs-scribe.json",
          ".kiro/agents/sre-reviewer.json",
          ".kiro/hooks/block-dangerous-shell.json",
          ".kiro/hooks/secret-scan-on-save.json",
          ".kiro/hooks/typecheck-on-save.json",
          ".kiro/hooks/pbt-on-guardrails.json",
          "scripts/kiro/guard-shell.mjs",
          "scripts/kiro/secret-scan.mjs"
        ],
        "invariant": "Unexpected authority outside registered product runtimes must be assigned its own boundary rather than implicitly covered by a runtime baseline pass.",
        "method": "source",
        "result": "The source inventory identified a distinct development-tool boundary: checked-in Kiro agents deny shell access, while hooks independently process tool/save events and launch commands. .kiro/hooks/block-dangerous-shell.json:7-10 invokes scripts/kiro/guard-shell.mjs; that script accepts several event shapes at lines 16-43 and allows empty/unrecognized command input at lines 45-55. .kiro/hooks/secret-scan-on-save.json:7-10 invokes scripts/kiro/secret-scan.mjs, whose missing/unreadable-file paths exit successfully at lines 57-64. Save hooks launch project checks at .kiro/hooks/typecheck-on-save.json:7-10 and .kiro/hooks/pbt-on-guardrails.json:7-12. This is not the peer-owned powers MCP registration boundary and is recorded in uncovered for a dedicated event-shape/enforcement/host-authority unit. No hook was executed, no restricted-agent bypass is asserted, and no runtime vulnerability candidate is inferred from the hook configuration alone.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "baseline",
    "priority": 8,
    "priority_reason": "A separate literal baseline and anomaly pass checks unassigned exposure patterns across the complete source inventory.",
    "hardening_notes": [
      ".gitignore:8-17 covers environment variants and local MCP settings but lacks generic private-key, credential-JSON, uploads and alternate local-config patterns. Add narrowly chosen patterns with explicit exceptions for intended fixtures; no committed key file or upload disclosure was established.",
      "Consolidate apps/api/src/auth/env.schema.ts and apps/api/src/auth/auth.config.module.ts with the root env/config definitions in apps/api/src/config/config.module.ts and apps/api/src/config/env.schema.ts. The old database default and duplicate auth providers make precedence harder to assess, although no request-controlled fallback or default JWT secret was found.",
      "apps/api/src/auth/services/nats-event-publisher.ts:34-39 reflects connector error.message in a ServiceUnavailableException. Prefer a fixed client-facing broker-unavailable message with separately controlled diagnostics. A populated sensitive connector error was not established, so this is not a disclosure finding.",
      "Direct API and actuator launchers do not enforce TLS themselves. Preserve the source-visible loopback/private publication model, and specify TLS termination when an operator chooses an off-host public binding. No off-host plaintext credential exposure was established from the supplied defaults.",
      "Review the stray tracked symlinks packages/agents/agents and packages/core/core, which point outside the repository. They were not followed and no runtime/export consumer was identified; their current presence is a source-hygiene issue rather than a demonstrated boundary violation."
    ]
  },
  {
    "coverage_id": "packages%2Factuator%2Fsrc%2Fhandler.ts%23createActionHandler::packages%2Factuator%2Fsrc%2Fexecute.ts%23createActuator::packages%2Factuator::AI-AND-LLM.md%23Action-confirmation%20and%20approval%20binding",
    "canonical_refs": {
      "surface": "packages/actuator/src/handler.ts#createActionHandler",
      "boundary": "packages/actuator/src/execute.ts#createActuator",
      "subsystem": "packages/actuator",
      "attack_class": "AI-AND-LLM.md#Action-confirmation and approval binding"
    },
    "surface": "Signed runtime action requests and durable admission",
    "boundary": "Action signer and approver to Docker/Kubernetes service changes and audit state",
    "subsystem": "packages/actuator",
    "attack_class": "Approval, normalized action and resource binding",
    "starting_paths": [
      "packages/actuator/src",
      "packages/policy/src",
      "apps/api/src/actions",
      "apps/api/src/internal/policy-context.service.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "AI-AND-LLM.md#Core discipline",
      "AI-AND-LLM.md#Action-confirmation and approval binding",
      "AI-AND-LLM.md#Universal moves",
      "AI-AND-LLM.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Cryptography and secrets",
        "reason": "This distinct ordinary class has a sibling unit in packages/actuator; this unit covers Approval, normalized action and resource binding."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-actuator",
    "reviewed_paths": [
      "packages/actuator/src/handler.ts",
      "packages/actuator/src/types.ts",
      "packages/actuator/src/sign.ts",
      "packages/actuator/src/execute.ts",
      "packages/actuator/src/claims.ts",
      "packages/actuator/src/actuator.test.ts",
      "packages/actuator/src/claims.test.ts",
      "packages/actuator/src/main.ts",
      "packages/actuator/src/backends.ts",
      "packages/policy/src/decide.ts",
      "deploy/compose/graveshift.compose.yml",
      "graveshift.config.yaml",
      "docs/adr/0017-deployment-topology.md"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-actuator",
        "reviewed_paths": [
          "packages/actuator/src/handler.ts",
          "packages/actuator/src/types.ts",
          "packages/actuator/src/sign.ts",
          "packages/actuator/src/execute.ts",
          "packages/actuator/src/claims.ts",
          "packages/actuator/src/actuator.test.ts",
          "packages/actuator/src/claims.test.ts"
        ],
        "invariant": "The normalized action, complete accepted arguments, approval identity and validity interval must be authenticated and must remain the values used at execution.",
        "method": "source",
        "result": "The HTTP handler bounds the body to 16 KiB and passes parsed JSON to one execution path. Strict schemas reject extra fields, invalid runtime/kind combinations and replicas on restarts. HMAC canonicalization covers action, approval and context; execution uses the parsed object, while admission and audit receive clones. Admission checks action/incident equality, an explicit approver ID and the half-open validity interval with a maximum 15-minute TTL. Existing mutation and hash tests were read as specifications only. No unsigned-field substitution was found. The signed service name still requires a correctly scoped backend resource resolution.",
        "artifact": null
      },
      {
        "agent_id": "hunt-actuator",
        "reviewed_paths": [
          "packages/actuator/src/main.ts",
          "packages/actuator/src/backends.ts",
          "packages/policy/src/decide.ts",
          "deploy/compose/graveshift.compose.yml",
          "graveshift.config.yaml",
          "docs/adr/0017-deployment-topology.md"
        ],
        "invariant": "A Blessing for one service resource must authorize only that resource and its intended group of containers.",
        "method": "source",
        "result": "The Docker writer resolves only com.docker.compose.service=<service> and restarts every returned container ID. Neither the action nor the writer binds a Compose project. The launcher uses this writer with a host-socket proxy; the maintained Compose definition shows no project-specific resource filter. The exact HMAC and service allowlist do not distinguish same-named services from different Compose projects. This supports a conditional resource-binding candidate. The checked-in policy is propose, the platform action producer is deferred, and actual co-tenancy, intended approval scope and effective proxy filtering were not observed.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "packages/actuator/createDockerRestarter/compose-project-binding"
    ],
    "unresolved": [
      "Whether an enabled deployment exposes containers from separate Compose projects through the actuator proxy and intends each Blessing to cover only one of those projects.",
      "No bounded backend observation was made because complete OS-enforced memory and cumulative disk controls are unavailable; project execution is prohibited."
    ],
    "assignment_group": "actuator",
    "priority": 3,
    "priority_reason": "Runtime actions have direct workload-write authority and explicit signature, approval, policy and replay controls.",
    "hardening_notes": [
      "packages/actuator/src/main.ts:38-41 deliberately uses an acknowledgement-only audit callback and sets durableAudit:false at line 71. Runtime responses correctly remain pending, and the SQLite claim still protects replay, but this is not a durable Project audit handoff. Add a signed Project binding and a real durable audit sink before presenting runtime actions as recorded in a Project audit chain. This is an explicit integration limit, not a demonstrated unauthorized action by itself.",
      "packages/actuator/src/guards.ts exposes reopened(), but no production caller in the assigned runtime paths feeds incident reopens into it; source tests invoke it manually. When the deferred runtime incident/approval producer is implemented, connect authenticated reopen notifications to this helper and define restart persistence of breaker state. The existing rate and human-approval gates still apply, so this integration gap alone was not promoted as a privilege-boundary finding."
    ]
  },
  {
    "coverage_id": "packages%2Factuator%2Fsrc%2Fhandler.ts%23createActionHandler::packages%2Factuator%2Fsrc%2Fexecute.ts%23createActuator::packages%2Factuator::ATTACK-CLASSES.md%23Cryptography%20and%20secrets",
    "canonical_refs": {
      "surface": "packages/actuator/src/handler.ts#createActionHandler",
      "boundary": "packages/actuator/src/execute.ts#createActuator",
      "subsystem": "packages/actuator",
      "attack_class": "ATTACK-CLASSES.md#Cryptography and secrets"
    },
    "surface": "Signed runtime action requests and durable admission",
    "boundary": "Action signer and approver to Docker/Kubernetes service changes and audit state",
    "subsystem": "packages/actuator",
    "attack_class": "Runtime signature and secret integrity",
    "starting_paths": [
      "packages/actuator/src",
      "packages/policy/src",
      "apps/api/src/actions",
      "apps/api/src/internal/policy-context.service.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Cryptography and secrets",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in packages/actuator; this unit covers Runtime signature and secret integrity."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-actuator",
    "reviewed_paths": [
      "packages/actuator/src/types.ts",
      "packages/actuator/src/sign.ts",
      "packages/actuator/src/execute.ts",
      "packages/actuator/src/main.ts",
      "packages/actuator/src/audit.ts",
      "packages/actuator/src/handler.ts",
      "packages/actuator/src/audit-http.ts",
      "packages/actuator/src/audit-http.test.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-actuator",
        "reviewed_paths": [
          "packages/actuator/src/types.ts",
          "packages/actuator/src/sign.ts",
          "packages/actuator/src/execute.ts",
          "packages/actuator/src/main.ts"
        ],
        "invariant": "Every runtime request must have a valid keyed signature over the accepted object; invalid or absent secrets and malformed signatures must fail closed.",
        "method": "source",
        "result": "The launcher and factory reject secrets shorter than 32 characters. The accepted signature is exactly 64 lowercase hex characters. Signing uses keyed SHA-256, deterministic sorted object keys, preserved array order and JSON encoding. Verification computes the expected signature over all accepted unsigned fields and uses timingSafeEqual on equal-length decoded buffers before admission. The request hash includes the signature and all request fields. No unsigned fallback, weak token generator or alternate runtime execution route was found in the assigned paths. Secret entropy remains operator-provided.",
        "artifact": null
      },
      {
        "agent_id": "hunt-actuator",
        "reviewed_paths": [
          "packages/actuator/src/audit.ts",
          "packages/actuator/src/handler.ts",
          "packages/actuator/src/audit-http.ts",
          "packages/actuator/src/audit-http.test.ts"
        ],
        "invariant": "Runtime signatures, HMAC keys and internal bearer credentials must not enter public responses, audit payloads or raw transport errors.",
        "method": "source",
        "result": "The HTTP response exposes status, classified reason, audit status and an optional prior runtime outcome. Audit construction selects action and approval metadata and omits the signature and secret. The optional API adapter keeps its internal bearer in a request header, rejects credentials in URL userinfo, rejects redirects, sets a timeout and replaces transport errors with fixed messages. Its source tests specify secret-free errors and were not executed. No disclosure path was found for the runtime HMAC key or bearer in these outputs.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "actuator",
    "priority": 3,
    "priority_reason": "Runtime actions have direct workload-write authority and explicit signature, approval, policy and replay controls.",
    "hardening_notes": [
      "packages/actuator/src/main.ts:38-41 deliberately uses an acknowledgement-only audit callback and sets durableAudit:false at line 71. Runtime responses correctly remain pending, and the SQLite claim still protects replay, but this is not a durable Project audit handoff. Add a signed Project binding and a real durable audit sink before presenting runtime actions as recorded in a Project audit chain. This is an explicit integration limit, not a demonstrated unauthorized action by itself.",
      "packages/actuator/src/guards.ts exposes reopened(), but no production caller in the assigned runtime paths feeds incident reopens into it; source tests invoke it manually. When the deferred runtime incident/approval producer is implemented, connect authenticated reopen notifications to this helper and define restart persistence of breaker state. The existing rate and human-approval gates still apply, so this integration gap alone was not promoted as a privilege-boundary finding."
    ]
  },
  {
    "coverage_id": "packages%2Factuator%2Fsrc%2Fhandler.ts%23createActionHandler::packages%2Factuator%2Fsrc%2Fexecute.ts%23createActuator::packages%2Factuator::ATTACK-CLASSES.md%23Injection",
    "canonical_refs": {
      "surface": "packages/actuator/src/handler.ts#createActionHandler",
      "boundary": "packages/actuator/src/execute.ts#createActuator",
      "subsystem": "packages/actuator",
      "attack_class": "ATTACK-CLASSES.md#Injection"
    },
    "surface": "Signed runtime action requests and durable admission",
    "boundary": "Action signer and approver to Docker/Kubernetes service changes and audit state",
    "subsystem": "packages/actuator",
    "attack_class": "Backend selectors and parameter injection",
    "starting_paths": [
      "packages/actuator/src",
      "packages/policy/src",
      "apps/api/src/actions",
      "apps/api/src/internal/policy-context.service.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Injection",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Cryptography and secrets",
        "reason": "This distinct ordinary class has a sibling unit in packages/actuator; this unit covers Backend selectors and parameter injection."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-actuator",
    "reviewed_paths": [
      "packages/actuator/src/handler.ts",
      "packages/actuator/src/types.ts",
      "packages/actuator/src/claims.ts",
      "packages/actuator/src/execute.ts",
      "packages/policy/src/decide.ts",
      "packages/policy/src/evaluation.ts",
      "packages/actuator/src/backends.ts",
      "packages/actuator/src/admission-durable.ts",
      "apps/api/src/actions/action.repo.ts",
      "apps/api/src/actions/dto/claim-action.dto.ts",
      "apps/api/src/actions/dto/complete-action.dto.ts",
      "apps/api/src/internal/project-grant.ts",
      "packages/actuator/src/audit-http.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-actuator",
        "reviewed_paths": [
          "packages/actuator/src/handler.ts",
          "packages/actuator/src/types.ts",
          "packages/actuator/src/claims.ts",
          "packages/actuator/src/execute.ts",
          "packages/policy/src/decide.ts",
          "packages/policy/src/evaluation.ts"
        ],
        "invariant": "Caller-controlled action fields must not become arbitrary backend operations, selectors or unbounded numeric parameters.",
        "method": "source",
        "result": "The action schema permits only ASCII lowercase service names with internal hyphens, two runtimes and restart/scale operations. Docker scale and restart replicas are rejected. Scale requires an explicit service allowlist, a bounded matching rule and a safe integer replica count within that rule. Unknown fields cannot add backend arguments. Dispatch selects fixed methods and never invokes a shell. No action-field injection path survived these controls.",
        "artifact": null
      },
      {
        "agent_id": "hunt-actuator",
        "reviewed_paths": [
          "packages/actuator/src/backends.ts",
          "packages/actuator/src/admission-durable.ts",
          "apps/api/src/actions/action.repo.ts",
          "apps/api/src/actions/dto/claim-action.dto.ts",
          "apps/api/src/actions/dto/complete-action.dto.ts",
          "apps/api/src/internal/project-grant.ts",
          "packages/actuator/src/audit-http.ts"
        ],
        "invariant": "The final HTTP, Kubernetes and storage consumers must retain structural separation between trusted operations and caller data.",
        "method": "source",
        "result": "Docker filters are JSON serialized and URL encoded, returned Docker IDs are encoded into a fixed restart path, and the base URL is operator configuration. Container IDs originate from the privileged Docker response rather than workload telemetry. Kubernetes uses typed patch calls with a configured namespace, the validated service name and a fixed patch body. SQLite values use bound parameters; API storage uses Prisma queries and tagged SQL parameters. API DTOs validate the strict claim/completion schemas, and project grants require numeric IDs. Optional API transport uses fixed paths and serialized JSON. The Docker cross-project selection concern is a resource-authorization issue tracked in its assigned companion unit, without evidence of syntax injection.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "actuator",
    "priority": 3,
    "priority_reason": "Runtime actions have direct workload-write authority and explicit signature, approval, policy and replay controls.",
    "hardening_notes": [
      "packages/actuator/src/main.ts:38-41 deliberately uses an acknowledgement-only audit callback and sets durableAudit:false at line 71. Runtime responses correctly remain pending, and the SQLite claim still protects replay, but this is not a durable Project audit handoff. Add a signed Project binding and a real durable audit sink before presenting runtime actions as recorded in a Project audit chain. This is an explicit integration limit, not a demonstrated unauthorized action by itself.",
      "packages/actuator/src/guards.ts exposes reopened(), but no production caller in the assigned runtime paths feeds incident reopens into it; source tests invoke it manually. When the deferred runtime incident/approval producer is implemented, connect authenticated reopen notifications to this helper and define restart persistence of breaker state. The existing rate and human-approval gates still apply, so this integration gap alone was not promoted as a privilege-boundary finding."
    ]
  },
  {
    "coverage_id": "packages%2Factuator%2Fsrc%2Fhandler.ts%23createActionHandler::packages%2Factuator%2Fsrc%2Fexecute.ts%23createActuator::packages%2Factuator::CLOUD-AND-DEPLOYMENT.md%23Namespace%20and%20label%20trust%20confusion",
    "canonical_refs": {
      "surface": "packages/actuator/src/handler.ts#createActionHandler",
      "boundary": "packages/actuator/src/execute.ts#createActuator",
      "subsystem": "packages/actuator",
      "attack_class": "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion"
    },
    "surface": "Signed runtime action requests and durable admission",
    "boundary": "Action signer and approver to Docker/Kubernetes service changes and audit state",
    "subsystem": "packages/actuator",
    "attack_class": "Runtime policy and target identity authorization",
    "starting_paths": [
      "packages/actuator/src",
      "packages/policy/src",
      "apps/api/src/actions",
      "apps/api/src/internal/policy-context.service.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "CLOUD-AND-DEPLOYMENT.md#Core discipline",
      "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion",
      "CLOUD-AND-DEPLOYMENT.md#Universal moves",
      "CLOUD-AND-DEPLOYMENT.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Cryptography and secrets",
        "reason": "This distinct ordinary class has a sibling unit in packages/actuator; this unit covers Runtime policy and target identity authorization."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-actuator",
    "reviewed_paths": [
      "packages/policy/src/schema.ts",
      "packages/policy/src/action.ts",
      "packages/policy/src/mode.ts",
      "packages/policy/src/evaluation.ts",
      "packages/policy/src/decide.ts",
      "packages/policy/src/load.ts",
      "packages/config/src/load.ts",
      "apps/api/src/config/boot.config.ts",
      "packages/actuator/src/main.ts",
      "graveshift.config.yaml",
      "examples/haunted-candy-shop/graveshift.config.yaml",
      "docs/adr/0015-one-config-file-at-boot.md",
      "packages/actuator/src/claims.ts",
      "packages/actuator/src/types.ts",
      "packages/actuator/src/admission-durable.ts",
      "packages/actuator/src/execute.ts",
      "packages/actuator/src/handler.ts",
      "packages/actuator/src/sign.ts",
      "apps/api/src/actions/action.repo.ts",
      "apps/api/src/internal/policy-context.service.ts",
      "apps/api/src/audit/audit.usage.ts",
      "apps/api/src/audit/audit.repo.ts",
      "packages/core/src/policy-context.ts",
      "apps/api/src/internal/policy-context.controller.ts",
      "apps/api/src/internal/policy-context.dto.ts",
      "apps/api/src/internal/internal.guard.ts",
      "apps/api/src/internal/project-grant.ts",
      "apps/api/src/hauntings/haunting.repo.ts",
      "apps/api/src/app.module.ts",
      "apps/api/src/app.factory.ts",
      "packages/actuator/src/backends.ts",
      "deploy/compose/graveshift.compose.yml"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-actuator",
        "reviewed_paths": [
          "packages/policy/src/schema.ts",
          "packages/policy/src/action.ts",
          "packages/policy/src/mode.ts",
          "packages/policy/src/evaluation.ts",
          "packages/policy/src/decide.ts",
          "packages/policy/src/load.ts",
          "packages/config/src/load.ts",
          "apps/api/src/config/boot.config.ts",
          "packages/actuator/src/main.ts",
          "graveshift.config.yaml",
          "examples/haunted-candy-shop/graveshift.config.yaml",
          "docs/adr/0015-one-config-file-at-boot.md"
        ],
        "invariant": "Runtime permission must derive from validated operator policy, explicit target rules and an effective act mode; a model or request must not broaden it.",
        "method": "source",
        "result": "Policy is loaded and validated at boot; configuration changes require a restart by the documented contract. API boot policy is recursively frozen. Deny rules take precedence, unmatched actions default to deny, runtime actions require an explicit service allowlist, and scale must have valid bounds. Runtime requests cannot supply envMode. A valid environment override can only select an equal or safer mode; invalid values do not raise policy mode. Both inspected example/default configurations are propose. These gates are present, but their usage-counter inputs are incomplete in runtime admission.",
        "artifact": null
      },
      {
        "agent_id": "hunt-actuator",
        "reviewed_paths": [
          "packages/actuator/src/claims.ts",
          "packages/actuator/src/types.ts",
          "packages/actuator/src/admission-durable.ts",
          "packages/actuator/src/execute.ts",
          "packages/actuator/src/handler.ts",
          "packages/actuator/src/sign.ts",
          "apps/api/src/actions/action.repo.ts",
          "apps/api/src/internal/policy-context.service.ts",
          "apps/api/src/audit/audit.usage.ts",
          "apps/api/src/audit/audit.repo.ts",
          "packages/core/src/policy-context.ts"
        ],
        "invariant": "Runtime admission must enforce diagnosis-loop and daily-spend policy limits using authoritative facts, and unavailable facts must not become zero usage.",
        "method": "source",
        "result": "claims.runtimeDecision supplies real admission action counts but sets diagnosisLoops and llmSpentTodayUsd to zero. The policy gate compares both quantities against limits for runtime actions as well as proposals. The strict signed ContextSchema cannot carry these counters, and the active SQLite rules have no authoritative-usage reader. API ActionRepo calls the same helper, so the sibling admission path has the same omission. In contrast, PolicyContextService obtains recorded usage through AuditRepo, whose query counts diagnosis calls and daily Project spend and rejects unknown cost rows. Source therefore supports a policy-input substitution candidate. No runtime outcome was observed.",
        "artifact": null
      },
      {
        "agent_id": "hunt-actuator",
        "reviewed_paths": [
          "apps/api/src/internal/policy-context.controller.ts",
          "apps/api/src/internal/policy-context.dto.ts",
          "apps/api/src/internal/internal.guard.ts",
          "apps/api/src/internal/project-grant.ts",
          "apps/api/src/hauntings/haunting.repo.ts",
          "apps/api/src/app.module.ts",
          "apps/api/src/app.factory.ts"
        ],
        "invariant": "The authoritative policy-context dependency must authenticate its peer and bind recorded facts to the granted Project, incident and service.",
        "method": "source",
        "result": "The registered internal context controller uses InternalGuard; its separate bearer is compared through fixed-size SHA-256 digests and timingSafeEqual. Global DTO validation rejects undeclared fields. ProjectGrant checks a stored numeric Project grant. Incident reads use the composite Project/incident key; diagnosis-reference reads filter Project, service and diagnosis ID. PolicyContextService rejects missing Diagnosis or service mismatch before deriving facts. No caller-field override was found at this dependency. Runtime admission currently does not consume this authoritative context.",
        "artifact": null
      },
      {
        "agent_id": "hunt-actuator",
        "reviewed_paths": [
          "packages/actuator/src/backends.ts",
          "deploy/compose/graveshift.compose.yml",
          "packages/actuator/src/main.ts",
          "packages/actuator/src/types.ts"
        ],
        "invariant": "A service label or name must resolve inside the intended runtime resource scope.",
        "method": "source",
        "result": "Kubernetes namespace selection is fixed by operator configuration, and requests cannot override it. No claim is made about the incomplete Kubernetes deployment scaffolds or their live attachments. Docker resolution is instead global to the configured daemon by Compose service label, with no Compose-project predicate or signed Project scope. The host-socket proxy definition supplies broad container visibility subject to its unverified effective configuration. This is the same resource-binding root cause linked from the approval unit.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "packages/actuator/createDockerRestarter/compose-project-binding",
      "packages/actuator/runtimeDecision/zeroed-policy-usage"
    ],
    "unresolved": [
      "Docker candidate: intended per-project approval scope, effective proxy filtering, co-tenancy and enabled act configuration require bounded or owner-observed validation.",
      "Policy-usage candidate: a bounded comparison of recorded nonzero usage, the canonical policy decision and the resulting stub backend invocation is blocked by the missing complete OS-enforced memory and cumulative disk sandbox controls."
    ],
    "assignment_group": "actuator",
    "priority": 3,
    "priority_reason": "Runtime actions have direct workload-write authority and explicit signature, approval, policy and replay controls.",
    "hardening_notes": [
      "packages/actuator/src/main.ts:38-41 deliberately uses an acknowledgement-only audit callback and sets durableAudit:false at line 71. Runtime responses correctly remain pending, and the SQLite claim still protects replay, but this is not a durable Project audit handoff. Add a signed Project binding and a real durable audit sink before presenting runtime actions as recorded in a Project audit chain. This is an explicit integration limit, not a demonstrated unauthorized action by itself.",
      "packages/actuator/src/guards.ts exposes reopened(), but no production caller in the assigned runtime paths feeds incident reopens into it; source tests invoke it manually. When the deferred runtime incident/approval producer is implemented, connect authenticated reopen notifications to this helper and define restart persistence of breaker state. The existing rate and human-approval gates still apply, so this integration gap alone was not promoted as a privilege-boundary finding."
    ]
  },
  {
    "coverage_id": "packages%2Factuator%2Fsrc%2Fhandler.ts%23createActionHandler::packages%2Factuator%2Fsrc%2Fexecute.ts%23createActuator::packages%2Factuator::PROTOCOLS-RPC-AND-MESSAGING.md%23Duplicate%20delivery%20and%20idempotency%20gaps",
    "canonical_refs": {
      "surface": "packages/actuator/src/handler.ts#createActionHandler",
      "boundary": "packages/actuator/src/execute.ts#createActuator",
      "subsystem": "packages/actuator",
      "attack_class": "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps"
    },
    "surface": "Signed runtime action requests and durable admission",
    "boundary": "Action signer and approver to Docker/Kubernetes service changes and audit state",
    "subsystem": "packages/actuator",
    "attack_class": "Single-use admission, recheck and crash recovery",
    "starting_paths": [
      "packages/actuator/src",
      "packages/policy/src",
      "apps/api/src/actions",
      "apps/api/src/internal/policy-context.service.ts"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "PROTOCOLS-RPC-AND-MESSAGING.md#Core discipline",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Universal moves",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Cryptography and secrets",
        "reason": "This distinct ordinary class has a sibling unit in packages/actuator; this unit covers Single-use admission, recheck and crash recovery."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-actuator",
    "reviewed_paths": [
      "packages/actuator/src/admission-durable.ts",
      "packages/actuator/src/claims.ts",
      "packages/actuator/src/sign.ts",
      "packages/actuator/src/execute.ts",
      "packages/actuator/src/main.ts",
      "packages/actuator/src/handler.ts",
      "packages/actuator/src/durable.test.ts",
      "packages/actuator/src/admission-durable.test.ts",
      "packages/actuator/src/admission.test.ts",
      "packages/actuator/src/admission-ownership.test.ts",
      "packages/actuator/src/guards.ts",
      "apps/api/src/actions/actions.controller.ts",
      "apps/api/src/actions/action.repo.ts",
      "apps/api/src/actions/dto/claim-action.dto.ts",
      "apps/api/src/actions/dto/complete-action.dto.ts",
      "apps/api/src/actions/actions.module.ts",
      "apps/api/src/internal/internal.guard.ts",
      "apps/api/src/internal/project-grant.ts",
      "apps/api/prisma/schema.prisma",
      "apps/api/src/audit/audit.repo.ts",
      "packages/actuator/src/audit-http.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-actuator",
        "reviewed_paths": [
          "packages/actuator/src/admission-durable.ts",
          "packages/actuator/src/claims.ts",
          "packages/actuator/src/sign.ts",
          "packages/actuator/src/execute.ts",
          "packages/actuator/src/main.ts"
        ],
        "invariant": "Within the configured admission store, a token or action ID must reserve capacity durably before any backend effect and must never authorize a second effect after retry or restart.",
        "method": "source",
        "result": "The active launcher requires a file-backed store and refuses startup if it cannot open it. SQLite has a token primary key and a unique action-ID index. claim rechecks prior identity inside BEGIN IMMEDIATE, derives service counts and capacity, requires its audit callback acknowledgement, inserts the row and commits before returning claimed. Only that result reaches execution. Prior unfinished or changed-hash claims return uncertain; completed claims return their known result without executing. Incomplete claims remain counted beyond approval expiry and the ten-minute window. Retained rows continue to block old token/action identities after completed rows stop consuming active capacity. No single-use bypass was found for a store reopened at the same configured path.",
        "artifact": null
      },
      {
        "agent_id": "hunt-actuator",
        "reviewed_paths": [
          "packages/actuator/src/handler.ts",
          "packages/actuator/src/durable.test.ts",
          "packages/actuator/src/admission-durable.test.ts",
          "packages/actuator/src/admission.test.ts",
          "packages/actuator/src/admission-ownership.test.ts",
          "packages/actuator/src/guards.ts"
        ],
        "invariant": "Expiry, breaker changes, lost admission replies, backend failures and completion failures must stop or retain the claim rather than replaying an uncertain runtime effect.",
        "method": "source",
        "result": "The execution path rechecks approval time/binding/approver and breaker eligibility after admission, then records and runs one backend attempt. Claim failure precedes the effect; a late denial completes the consumed claim. Runtime failures count as terminal attempts. Failed completion leaves the durable admitted row, so another request is uncertain rather than executable. Known outcomes are preserved in responses without raw exception details. Source tests specify restart, duplicate action IDs, pending capacity, lost-response, expiry-during-audit and terminal-failure cases; none were run. Global diagnosis/spend gate omissions are separately tracked in the runtime-policy unit and are not a duplicate-delivery failure.",
        "artifact": null
      },
      {
        "agent_id": "hunt-actuator",
        "reviewed_paths": [
          "apps/api/src/actions/actions.controller.ts",
          "apps/api/src/actions/action.repo.ts",
          "apps/api/src/actions/dto/claim-action.dto.ts",
          "apps/api/src/actions/dto/complete-action.dto.ts",
          "apps/api/src/actions/actions.module.ts",
          "apps/api/src/internal/internal.guard.ts",
          "apps/api/src/internal/project-grant.ts",
          "apps/api/prisma/schema.prisma",
          "apps/api/src/audit/audit.repo.ts",
          "packages/actuator/src/audit-http.ts"
        ],
        "invariant": "The optional API admission path must bind replay state and completion to one granted Project and the exact request without weakening the one-effect transition.",
        "method": "source",
        "result": "Internal claim/completion routes require the internal bearer and stored Project grant. The repository recomputes the request hash, serializes each Project through the audit-chain transaction lock, uses the database clock and stores Project/token plus Project/action identity. Claim creation and its audit append share one transaction. Completion checks Project, token, action and hash, uses an admitted-state conditional update and appends the terminal audit in the same transaction. The HTTP adapter validates responses, uses a separate bearer, refuses redirects, performs one request and treats a missing/invalid acknowledgement as failure. The production actuator launcher does not use this adapter; no remote durability or shared-store deployment was inferred.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "actuator",
    "priority": 3,
    "priority_reason": "Runtime actions have direct workload-write authority and explicit signature, approval, policy and replay controls.",
    "hardening_notes": [
      "packages/actuator/src/main.ts:38-41 deliberately uses an acknowledgement-only audit callback and sets durableAudit:false at line 71. Runtime responses correctly remain pending, and the SQLite claim still protects replay, but this is not a durable Project audit handoff. Add a signed Project binding and a real durable audit sink before presenting runtime actions as recorded in a Project audit chain. This is an explicit integration limit, not a demonstrated unauthorized action by itself.",
      "packages/actuator/src/guards.ts exposes reopened(), but no production caller in the assigned runtime paths feeds incident reopens into it; source tests invoke it manually. When the deferred runtime incident/approval producer is implemented, connect authenticated reopen notifications to this helper and define restart persistence of breaker state. The existing rate and human-approval gates still apply, so this integration gap alone was not promoted as a privilege-boundary finding."
    ]
  },
  {
    "coverage_id": "packages%2Fevents%2Fsrc%2Fconsumer.ts%23connectEventsConsumer::packages%2Fevents%2Fsrc%2Fconsumer.ts%23processQueued::packages%2Fevents::ATTACK-CLASSES.md%23Resource%20and%20file%20handling",
    "canonical_refs": {
      "surface": "packages/events/src/consumer.ts#connectEventsConsumer",
      "boundary": "packages/events/src/consumer.ts#processQueued",
      "subsystem": "packages/events",
      "attack_class": "ATTACK-CLASSES.md#Resource and file handling"
    },
    "surface": "NATS consumer, Docker/Kubernetes/Prometheus collector streams and watcher intake",
    "boundary": "Broker and workload evidence to granted Project observations and incident state",
    "subsystem": "packages/events",
    "attack_class": "Collector URL, parser and file sink safety",
    "starting_paths": [
      "packages/events/src",
      "packages/sources-docker/src",
      "packages/sources-k8s/src",
      "packages/metrics/src",
      "packages/integrations/src",
      "packages/watcher/src",
      "apps/daemon/src/observations.ts",
      "apps/daemon/src/collectors.ts",
      "deploy/compose/nats"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Resource and file handling",
    "selected_companion_blocks": [],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in packages/events; this unit covers Collector URL, parser and file sink safety."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-events-sources",
    "reviewed_paths": [
      "apps/daemon/src/collectors.ts",
      "packages/sources-docker/src/api.ts",
      "packages/sources-k8s/src/kube-api.ts",
      "packages/metrics/src/client.ts",
      "packages/metrics/src/queries.ts",
      "packages/events/src/consumer.ts",
      "packages/core/src/envelope.ts",
      "packages/core/src/privacy.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-events-sources",
        "reviewed_paths": [
          "apps/daemon/src/collectors.ts",
          "packages/sources-docker/src/api.ts",
          "packages/sources-k8s/src/kube-api.ts",
          "packages/metrics/src/client.ts",
          "packages/metrics/src/queries.ts",
          "packages/events/src/consumer.ts",
          "packages/core/src/envelope.ts",
          "packages/core/src/privacy.ts"
        ],
        "invariant": "Workload metadata and Event contents must not select an arbitrary network origin, executable deserializer or local filesystem sink in the assigned collectors and consumer.",
        "method": "source",
        "result": "Docker and Prometheus origins come from operator configuration; the daemon rejects non-HTTP(S) origins and URL credentials. Docker uses fixed API paths and encodes container IDs. Prometheus uses a fixed query path and JSON-quotes configured job selectors. Kubernetes uses the in-cluster client with fixed API operations. The reviewed paths contain no Event-derived file read/write or code-evaluation sink. The queued decoder checks 128 KiB before fatal UTF-8 decoding and JSON parsing, catches schema/privacy failures, and terminates malformed records. Docker skips malformed newline-delimited JSON frames and Kubernetes ignores malformed Event objects. This settles URL, deserialization and file-sink authority; availability bounds are assessed in the separate buffering unit.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "events-sources",
    "priority": 6,
    "priority_reason": "Untrusted workload data and at-least-once messages cross into shared incident processing and host collectors.",
    "hardening_notes": [
      "The checked-in consumer declares max_deliver=5, but processQueued has no delivery-count surface or exhausted-processing DLQ handoff. This is a recovery/operability gap; the configuration does prevent a claim of unlimited broker redelivery for an ordinary permanently failing record.",
      "The daemon uses one NATS connection for consuming and Collector publication. The checked-in read user lacks detection-publication permission, while the publication user lacks durable-consumer operations. Effective wiring needs a compatible identity or separate connections. This operator-wiring issue alone does not establish an unauthorized action or deployed exposure.",
      "Docker event buffering has no explicit per-frame byte cap, and Docker/Kubernetes evidence reads primarily limit line counts rather than response bytes. The reviewed origins are operator-selected; no attacker-selected URL or file sink was established. Byte caps and read deadlines would harden these adapters, but upstream runtime limits and a meaningful independent boundary result were not established as a separate finding.",
      "The legacy exported Docker/Kubernetes watch helpers retain abort listeners after a normal sleep resolves. Production Collectors import the shared integrations watch helper, whose sleep removes those listeners. No active daemon listener-leak finding is promoted from the legacy helpers."
    ]
  },
  {
    "coverage_id": "packages%2Fevents%2Fsrc%2Fconsumer.ts%23connectEventsConsumer::packages%2Fevents%2Fsrc%2Fconsumer.ts%23processQueued::packages%2Fevents::CLOUD-AND-DEPLOYMENT.md%23Namespace%20and%20label%20trust%20confusion",
    "canonical_refs": {
      "surface": "packages/events/src/consumer.ts#connectEventsConsumer",
      "boundary": "packages/events/src/consumer.ts#processQueued",
      "subsystem": "packages/events",
      "attack_class": "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion"
    },
    "surface": "NATS consumer, Docker/Kubernetes/Prometheus collector streams and watcher intake",
    "boundary": "Broker and workload evidence to granted Project observations and incident state",
    "subsystem": "packages/events",
    "attack_class": "Collector envelope and workload identity",
    "starting_paths": [
      "packages/events/src",
      "packages/sources-docker/src",
      "packages/sources-k8s/src",
      "packages/metrics/src",
      "packages/integrations/src",
      "packages/watcher/src",
      "apps/daemon/src/observations.ts",
      "apps/daemon/src/collectors.ts",
      "deploy/compose/nats"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
    "selected_companion_blocks": [
      "CLOUD-AND-DEPLOYMENT.md#Core discipline",
      "CLOUD-AND-DEPLOYMENT.md#Namespace and label trust confusion",
      "CLOUD-AND-DEPLOYMENT.md#Universal moves",
      "CLOUD-AND-DEPLOYMENT.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in packages/events; this unit covers Collector envelope and workload identity."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-events-sources",
    "reviewed_paths": [
      "apps/daemon/src/main.ts",
      "apps/daemon/src/collectors.ts",
      "apps/daemon/src/observations.ts",
      "packages/integrations/src/index.ts",
      "packages/sources-docker/src/source.ts",
      "packages/sources-k8s/src/source.ts",
      "packages/sources-k8s/src/map.ts",
      "packages/watcher/src/pipeline.ts",
      "packages/watcher/src/rules.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/hauntings/haunting.repo.ts",
      "apps/api/src/hauntings/haunting.mapper.ts",
      "packages/core/src/recorded.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-events-sources",
        "reviewed_paths": [
          "apps/daemon/src/main.ts",
          "apps/daemon/src/collectors.ts",
          "apps/daemon/src/observations.ts",
          "packages/integrations/src/index.ts",
          "packages/sources-docker/src/source.ts",
          "packages/sources-k8s/src/source.ts",
          "packages/sources-k8s/src/map.ts",
          "packages/watcher/src/pipeline.ts",
          "packages/watcher/src/rules.ts",
          "apps/api/src/auth/services/event-ingest.service.ts",
          "apps/api/src/hauntings/haunting.repo.ts",
          "apps/api/src/hauntings/haunting.mapper.ts",
          "packages/core/src/recorded.ts"
        ],
        "invariant": "Every workload identity, cached active Haunting and group-release decision must retain the authoritative Project and service namespace through observation processing.",
        "method": "source",
        "result": "Collector Project IDs come from trusted Context rather than workload labels. Kubernetes qualifies services with the configured prefix and Event namespace and applies the configured namespace filter; Docker takes its service selector from workload attributes but does not take a Project from them. API producers are checked against their Credential's Project and service. Watcher state, replay identity, dedupe and open groups include Project. The daemon bridge breaks that invariant: byService is keyed only by service, and an Event for a different Project can delete or replace the cached ID needed to release the first Project's closed group. The durable active lookup excludes closed rows, but the subsequent get/upsert path permits the stale group's next detection to be appended to the closed Haunting. Serial consumer dispatch prevents a separate current-variable concurrency claim; none is reported.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "apps/daemon/src/observations.ts:service-cache-project-scope"
    ],
    "unresolved": [
      "The two-Project close/interleave/new-detection sequence has not been executed because complete memory and cumulative disk sandbox controls are unavailable."
    ],
    "assignment_group": "events-sources",
    "priority": 6,
    "priority_reason": "Untrusted workload data and at-least-once messages cross into shared incident processing and host collectors.",
    "hardening_notes": [
      "The checked-in consumer declares max_deliver=5, but processQueued has no delivery-count surface or exhausted-processing DLQ handoff. This is a recovery/operability gap; the configuration does prevent a claim of unlimited broker redelivery for an ordinary permanently failing record.",
      "The daemon uses one NATS connection for consuming and Collector publication. The checked-in read user lacks detection-publication permission, while the publication user lacks durable-consumer operations. Effective wiring needs a compatible identity or separate connections. This operator-wiring issue alone does not establish an unauthorized action or deployed exposure.",
      "Docker event buffering has no explicit per-frame byte cap, and Docker/Kubernetes evidence reads primarily limit line counts rather than response bytes. The reviewed origins are operator-selected; no attacker-selected URL or file sink was established. Byte caps and read deadlines would harden these adapters, but upstream runtime limits and a meaningful independent boundary result were not established as a separate finding.",
      "The legacy exported Docker/Kubernetes watch helpers retain abort listeners after a normal sleep resolves. Production Collectors import the shared integrations watch helper, whose sleep removes those listeners. No active daemon listener-leak finding is promoted from the legacy helpers."
    ]
  },
  {
    "coverage_id": "packages%2Fevents%2Fsrc%2Fconsumer.ts%23connectEventsConsumer::packages%2Fevents%2Fsrc%2Fconsumer.ts%23processQueued::packages%2Fevents::PROTOCOLS-RPC-AND-MESSAGING.md%23Duplicate%20delivery%20and%20idempotency%20gaps",
    "canonical_refs": {
      "surface": "packages/events/src/consumer.ts#connectEventsConsumer",
      "boundary": "packages/events/src/consumer.ts#processQueued",
      "subsystem": "packages/events",
      "attack_class": "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps"
    },
    "surface": "NATS consumer, Docker/Kubernetes/Prometheus collector streams and watcher intake",
    "boundary": "Broker and workload evidence to granted Project observations and incident state",
    "subsystem": "packages/events",
    "attack_class": "Collector and consumer retry/replay semantics",
    "starting_paths": [
      "packages/events/src",
      "packages/sources-docker/src",
      "packages/sources-k8s/src",
      "packages/metrics/src",
      "packages/integrations/src",
      "packages/watcher/src",
      "apps/daemon/src/observations.ts",
      "apps/daemon/src/collectors.ts",
      "deploy/compose/nats"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "PROTOCOLS-RPC-AND-MESSAGING.md#Core discipline",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Duplicate delivery and idempotency gaps",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Universal moves",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in packages/events; this unit covers Collector and consumer retry/replay semantics."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-events-sources",
    "reviewed_paths": [
      "packages/events/src/consumer.ts",
      "packages/events/src/publisher.ts",
      "packages/events/src/streams.ts",
      "packages/events/src/subject.ts",
      "packages/integrations/src/delivery.ts",
      "packages/sources-docker/src/source.ts",
      "packages/sources-k8s/src/source.ts",
      "packages/watcher/src/rules.ts",
      "apps/daemon/src/observations.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/auth/dto/publish-event.dto.ts",
      "apps/api/src/hauntings/haunting.repo.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-events-sources",
        "reviewed_paths": [
          "packages/events/src/consumer.ts",
          "packages/events/src/publisher.ts",
          "packages/events/src/streams.ts",
          "packages/events/src/subject.ts",
          "packages/integrations/src/delivery.ts",
          "packages/sources-docker/src/source.ts",
          "packages/sources-k8s/src/source.ts",
          "packages/watcher/src/rules.ts",
          "apps/daemon/src/observations.ts",
          "apps/api/src/auth/services/event-ingest.service.ts",
          "apps/api/src/auth/dto/publish-event.dto.ts",
          "apps/api/src/hauntings/haunting.repo.ts"
        ],
        "invariant": "An Event replay identity must be isolated by its Project, and a delivery cursor or completed marker must advance only after the corresponding side effect is acknowledged.",
        "method": "source",
        "result": "Collector native IDs include the Context Project and configured collector service; native cursors advance after queued publication, and stopped work cannot acknowledge. The consumer awaits observation processing and acknowledgement before recording completion, leaves failed work eligible for redelivery, and bounds its completed-ID set to 100000. The daemon reconciles recorded detections and durable Project-scoped audit receipts on retry. However, API callers choose Event IDs without a global uniqueness constraint, publisher msgID is only envelope.id in the one all-Project stream, and the consumer's completed set also uses only envelope.id. An authorized Event in one Project can therefore reserve another Project's known/predictable ID and cause its later detection to be acknowledged without dispatch. The watcher itself uses [projectId,id], showing the inconsistent scope at the preceding transport layer.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "packages/events/src/consumer.ts:projectless-event-dedupe"
    ],
    "unresolved": [
      "No bounded two-Project transport fixture or pinned-version broker deduplication observation was run under the source-only policy."
    ],
    "assignment_group": "events-sources",
    "priority": 6,
    "priority_reason": "Untrusted workload data and at-least-once messages cross into shared incident processing and host collectors.",
    "hardening_notes": [
      "The checked-in consumer declares max_deliver=5, but processQueued has no delivery-count surface or exhausted-processing DLQ handoff. This is a recovery/operability gap; the configuration does prevent a claim of unlimited broker redelivery for an ordinary permanently failing record.",
      "The daemon uses one NATS connection for consuming and Collector publication. The checked-in read user lacks detection-publication permission, while the publication user lacks durable-consumer operations. Effective wiring needs a compatible identity or separate connections. This operator-wiring issue alone does not establish an unauthorized action or deployed exposure.",
      "Docker event buffering has no explicit per-frame byte cap, and Docker/Kubernetes evidence reads primarily limit line counts rather than response bytes. The reviewed origins are operator-selected; no attacker-selected URL or file sink was established. Byte caps and read deadlines would harden these adapters, but upstream runtime limits and a meaningful independent boundary result were not established as a separate finding.",
      "The legacy exported Docker/Kubernetes watch helpers retain abort listeners after a normal sleep resolves. Production Collectors import the shared integrations watch helper, whose sleep removes those listeners. No active daemon listener-leak finding is promoted from the legacy helpers."
    ]
  },
  {
    "coverage_id": "packages%2Fevents%2Fsrc%2Fconsumer.ts%23connectEventsConsumer::packages%2Fevents%2Fsrc%2Fconsumer.ts%23processQueued::packages%2Fevents::PROTOCOLS-RPC-AND-MESSAGING.md%23Topic%2C%20routing-key%2C%20and%20subscription%20scope%20gaps",
    "canonical_refs": {
      "surface": "packages/events/src/consumer.ts#connectEventsConsumer",
      "boundary": "packages/events/src/consumer.ts#processQueued",
      "subsystem": "packages/events",
      "attack_class": "PROTOCOLS-RPC-AND-MESSAGING.md#Topic, routing-key, and subscription scope gaps"
    },
    "surface": "NATS consumer, Docker/Kubernetes/Prometheus collector streams and watcher intake",
    "boundary": "Broker and workload evidence to granted Project observations and incident state",
    "subsystem": "packages/events",
    "attack_class": "Broker topic and granted Project scope",
    "starting_paths": [
      "packages/events/src",
      "packages/sources-docker/src",
      "packages/sources-k8s/src",
      "packages/metrics/src",
      "packages/integrations/src",
      "packages/watcher/src",
      "apps/daemon/src/observations.ts",
      "apps/daemon/src/collectors.ts",
      "deploy/compose/nats"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "PROTOCOLS-RPC-AND-MESSAGING.md#Core discipline",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Topic, routing-key, and subscription scope gaps",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Universal moves",
      "PROTOCOLS-RPC-AND-MESSAGING.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
        "reason": "This distinct ordinary class has a sibling unit in packages/events; this unit covers Broker topic and granted Project scope."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-events-sources",
    "reviewed_paths": [
      "packages/events/src/subject.ts",
      "packages/events/src/consumer.ts",
      "packages/events/src/nats.ts",
      "packages/core/src/schemas.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/daemon/src/main.ts",
      "deploy/compose/nats/nats.conf",
      "deploy/compose/nats/graveshift-events.stream.json",
      "deploy/compose/nats/graveshift-watcher.consumer.json",
      "deploy/compose/graveshift.compose.yml"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-events-sources",
        "reviewed_paths": [
          "packages/events/src/subject.ts",
          "packages/events/src/consumer.ts",
          "packages/events/src/nats.ts",
          "packages/core/src/schemas.ts",
          "apps/api/src/auth/services/event-ingest.service.ts",
          "apps/daemon/src/main.ts",
          "deploy/compose/nats/nats.conf",
          "deploy/compose/nats/graveshift-events.stream.json",
          "deploy/compose/nats/graveshift-watcher.consumer.json",
          "deploy/compose/graveshift.compose.yml"
        ],
        "invariant": "A lower-trust producer must not escape its Project through subject tokens, payload overrides, lane disagreement, wildcard selection or an ungranted consumer subscription.",
        "method": "source",
        "result": "Project/type grammar rejects wildcards and empty tokens; service normalization produces one token. Decoding reconstructs the complete subject from the prepared body and requires exact equality, including Project and severity lane. processQueued checks the daemon's grantedProjectIds before replay lookup or processing and terminates or dead-letters an ungranted Event. DLQ subjects do not match the detection filter. Plugins publish through the API's bound Credential principal and receive no broker identity in this path. Checked-in NATS users are privileged API/read-side identities with explicit capabilities; no tenant-supplied topic or durable name is used. The consumer only binds the declared durable and does not provision it. Compose explicitly does not launch a daemon, so no live reachability or external ACL attachment is inferred. The global Event-ID namespace defect is recorded in its distinct replay unit.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "events-sources",
    "priority": 6,
    "priority_reason": "Untrusted workload data and at-least-once messages cross into shared incident processing and host collectors.",
    "hardening_notes": [
      "The checked-in consumer declares max_deliver=5, but processQueued has no delivery-count surface or exhausted-processing DLQ handoff. This is a recovery/operability gap; the configuration does prevent a claim of unlimited broker redelivery for an ordinary permanently failing record.",
      "The daemon uses one NATS connection for consuming and Collector publication. The checked-in read user lacks detection-publication permission, while the publication user lacks durable-consumer operations. Effective wiring needs a compatible identity or separate connections. This operator-wiring issue alone does not establish an unauthorized action or deployed exposure.",
      "Docker event buffering has no explicit per-frame byte cap, and Docker/Kubernetes evidence reads primarily limit line counts rather than response bytes. The reviewed origins are operator-selected; no attacker-selected URL or file sink was established. Byte caps and read deadlines would harden these adapters, but upstream runtime limits and a meaningful independent boundary result were not established as a separate finding.",
      "The legacy exported Docker/Kubernetes watch helpers retain abort listeners after a normal sleep resolves. Production Collectors import the shared integrations watch helper, whose sleep removes those listeners. No active daemon listener-leak finding is promoted from the legacy helpers."
    ]
  },
  {
    "coverage_id": "packages%2Fevents%2Fsrc%2Fconsumer.ts%23connectEventsConsumer::packages%2Fevents%2Fsrc%2Fconsumer.ts%23processQueued::packages%2Fevents::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Poison-record%20and%20head-of-line%20blocking",
    "canonical_refs": {
      "surface": "packages/events/src/consumer.ts#connectEventsConsumer",
      "boundary": "packages/events/src/consumer.ts#processQueued",
      "subsystem": "packages/events",
      "attack_class": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Poison-record and head-of-line blocking"
    },
    "surface": "NATS consumer, Docker/Kubernetes/Prometheus collector streams and watcher intake",
    "boundary": "Broker and workload evidence to granted Project observations and incident state",
    "subsystem": "packages/events",
    "attack_class": "Poison-record intake and recovery",
    "starting_paths": [
      "packages/events/src",
      "packages/sources-docker/src",
      "packages/sources-k8s/src",
      "packages/metrics/src",
      "packages/integrations/src",
      "packages/watcher/src",
      "apps/daemon/src/observations.ts",
      "apps/daemon/src/collectors.ts",
      "deploy/compose/nats"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Core discipline",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Poison-record and head-of-line blocking",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Universal moves",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in packages/events; this unit covers Poison-record intake and recovery."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-events-sources",
    "reviewed_paths": [
      "packages/integrations/src/delivery.ts",
      "packages/integrations/src/watch.ts",
      "packages/integrations/src/index.ts",
      "packages/sources-docker/src/api.ts",
      "packages/sources-docker/src/source.ts",
      "packages/sources-docker/src/map-details.ts",
      "packages/sources-k8s/src/kube-api.ts",
      "packages/sources-k8s/src/source.ts",
      "packages/sources-k8s/src/map.ts",
      "packages/sources-k8s/src/map-details.ts",
      "packages/core/src/envelope.ts",
      "packages/core/src/privacy.ts",
      "packages/redactor/src/index.ts",
      "packages/redactor/src/detectors.ts",
      "packages/events/src/consumer.ts",
      "packages/events/src/streams.ts",
      "apps/daemon/src/collectors.ts",
      "apps/daemon/src/main.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-events-sources",
        "reviewed_paths": [
          "packages/integrations/src/delivery.ts",
          "packages/integrations/src/watch.ts",
          "packages/integrations/src/index.ts",
          "packages/sources-docker/src/api.ts",
          "packages/sources-docker/src/source.ts",
          "packages/sources-docker/src/map-details.ts",
          "packages/sources-k8s/src/kube-api.ts",
          "packages/sources-k8s/src/source.ts",
          "packages/sources-k8s/src/map.ts",
          "packages/sources-k8s/src/map-details.ts",
          "packages/core/src/envelope.ts",
          "packages/core/src/privacy.ts",
          "packages/redactor/src/index.ts",
          "packages/redactor/src/detectors.ts",
          "packages/events/src/consumer.ts",
          "packages/events/src/streams.ts",
          "apps/daemon/src/collectors.ts",
          "apps/daemon/src/main.ts"
        ],
        "invariant": "One permanently invalid observation from a watched workload must not indefinitely prevent unrelated workloads from publishing through the shared Collector queue.",
        "method": "source",
        "result": "Malformed Docker frames and malformed Kubernetes Event objects are skipped, while invalid broker envelopes terminate and ordinary broker processing failures have a declared five-delivery maximum. Collector delivery is different: every preparation/publication exception is retried indefinitely at the queue head, and acknowledge/shift occurs only after success. A Kubernetes name containing a dummy model-key-shaped substring, such as demo-sk-aaaaaaaaaaaaaaaaaaaa, is incorporated into the qualified service and rejected by assertSafeMetadata. Docker's com.docker.compose.service attribute can similarly contain a dummy email address. Both failures occur inside the retrying entry.deliver path. The 256-item queue limit bounds count but preserves head-of-line blocking; Kubernetes drain prevents reconnecting, and Docker waits for queue room. The one-second stop deadline permits manual cancellation but does not quarantine the poison record during normal operation. Actual delegated workload authority and enabled Collector/publisher wiring remain deployment conditions.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "packages/integrations/src/delivery.ts:permanent-collector-poison-retry"
    ],
    "unresolved": [
      "A bounded poison-head fixture cannot be executed without complete memory and cumulative disk sandbox controls.",
      "An owner must establish that a less-trusted workload principal can choose the relevant names or labels in an enabled Collector's scope and that normal publication is authorized."
    ],
    "assignment_group": "events-sources",
    "priority": 6,
    "priority_reason": "Untrusted workload data and at-least-once messages cross into shared incident processing and host collectors.",
    "hardening_notes": [
      "The checked-in consumer declares max_deliver=5, but processQueued has no delivery-count surface or exhausted-processing DLQ handoff. This is a recovery/operability gap; the configuration does prevent a claim of unlimited broker redelivery for an ordinary permanently failing record.",
      "The daemon uses one NATS connection for consuming and Collector publication. The checked-in read user lacks detection-publication permission, while the publication user lacks durable-consumer operations. Effective wiring needs a compatible identity or separate connections. This operator-wiring issue alone does not establish an unauthorized action or deployed exposure.",
      "Docker event buffering has no explicit per-frame byte cap, and Docker/Kubernetes evidence reads primarily limit line counts rather than response bytes. The reviewed origins are operator-selected; no attacker-selected URL or file sink was established. Byte caps and read deadlines would harden these adapters, but upstream runtime limits and a meaningful independent boundary result were not established as a separate finding.",
      "The legacy exported Docker/Kubernetes watch helpers retain abort listeners after a normal sleep resolves. Production Collectors import the shared integrations watch helper, whose sleep removes those listeners. No active daemon listener-leak finding is promoted from the legacy helpers."
    ]
  },
  {
    "coverage_id": "packages%2Fevents%2Fsrc%2Fconsumer.ts%23connectEventsConsumer::packages%2Fevents%2Fsrc%2Fconsumer.ts%23processQueued::packages%2Fevents::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Unbounded%20buffering%20and%20cardinality",
    "canonical_refs": {
      "surface": "packages/events/src/consumer.ts#connectEventsConsumer",
      "boundary": "packages/events/src/consumer.ts#processQueued",
      "subsystem": "packages/events",
      "attack_class": "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality"
    },
    "surface": "NATS consumer, Docker/Kubernetes/Prometheus collector streams and watcher intake",
    "boundary": "Broker and workload evidence to granted Project observations and incident state",
    "subsystem": "packages/events",
    "attack_class": "Stream buffering and retained cardinality",
    "starting_paths": [
      "packages/events/src",
      "packages/sources-docker/src",
      "packages/sources-k8s/src",
      "packages/metrics/src",
      "packages/integrations/src",
      "packages/watcher/src",
      "apps/daemon/src/observations.ts",
      "apps/daemon/src/collectors.ts",
      "deploy/compose/nats"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Resource and file handling",
    "selected_companion_blocks": [
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Core discipline",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Unbounded buffering and cardinality",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Universal moves",
      "RESOURCE-EXHAUSTION-AND-AVAILABILITY.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in packages/events; this unit covers Stream buffering and retained cardinality."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "candidate",
    "agent_id": "hunt-events-sources",
    "reviewed_paths": [
      "apps/daemon/src/observations.ts",
      "apps/daemon/src/api-client.ts",
      "apps/daemon/src/main.ts",
      "packages/watcher/src/rules.ts",
      "packages/watcher/src/pipeline.ts",
      "packages/watcher/src/watcher.ts",
      "packages/watcher/src/types.ts",
      "packages/events/src/consumer.ts",
      "packages/events/src/streams.ts",
      "packages/integrations/src/delivery.ts",
      "packages/integrations/src/watch.ts",
      "packages/metrics/src/collector.ts",
      "packages/metrics/src/client.ts",
      "apps/api/src/auth/controllers/events.controller.ts",
      "apps/api/src/auth/services/event-ingest.service.ts",
      "apps/api/src/auth/dto/publish-event.dto.ts",
      "apps/api/src/auth/env.schema.ts",
      "apps/api/src/auth/payload-size.interceptor.ts",
      "apps/api/src/app.module.ts",
      "apps/api/src/app.factory.ts",
      "apps/api/src/hauntings/dto/haunting.dto.ts",
      "packages/core/src/envelope.ts",
      "packages/core/src/schemas.ts",
      "packages/core/src/recorded.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-events-sources",
        "reviewed_paths": [
          "apps/daemon/src/observations.ts",
          "apps/daemon/src/api-client.ts",
          "apps/daemon/src/main.ts",
          "packages/watcher/src/rules.ts",
          "packages/watcher/src/pipeline.ts",
          "packages/watcher/src/watcher.ts",
          "packages/watcher/src/types.ts",
          "packages/events/src/consumer.ts",
          "packages/events/src/streams.ts",
          "packages/integrations/src/delivery.ts",
          "packages/integrations/src/watch.ts",
          "packages/metrics/src/collector.ts",
          "packages/metrics/src/client.ts",
          "apps/api/src/auth/controllers/events.controller.ts",
          "apps/api/src/auth/services/event-ingest.service.ts",
          "apps/api/src/auth/dto/publish-event.dto.ts",
          "apps/api/src/auth/env.schema.ts",
          "apps/api/src/auth/payload-size.interceptor.ts",
          "apps/api/src/app.module.ts",
          "apps/api/src/app.factory.ts",
          "apps/api/src/hauntings/dto/haunting.dto.ts",
          "packages/core/src/envelope.ts",
          "packages/core/src/schemas.ts",
          "packages/core/src/recorded.ts"
        ],
        "invariant": "Accepted bounded Events must not create unbounded retained outcomes or unbounded temporal-processing cost in the daemon shared by granted Projects, including after terminal delivery failure.",
        "method": "source",
        "result": "Source-visible controls include the default 65536-byte API Event cap, default 60-per-60000-ms throttle, 128-KiB broker/decoder cap, five broker deliveries, 100000 completed IDs, 10000 watcher replay IDs, 256 Collector pending entries, cancellable Collector retry shutdown, and five-second metric query deadlines with one polling cycle at a time. These controls do not bound daemon pending outcomes: they are inserted before processing and deleted only after full success. An accepted 180-character Event ID produces a suffixed Haunting eventId longer than the internal DTO's 180-character maximum, creating a deterministic permanent failure without clearing the pending entry. Increasing observation times by the dedupe interval allows successive accepted detections whose cloned group histories accumulate in those retained outcomes. Separately, unique log/restart Events with one fixed valid observedAt grow temporal arrays without a count cap; downstream dedupe runs after those arrays are filtered and copied. The throttle bounds arrival rate but does not make caller timestamps advance or impose aggregate retention. Neither path was executed, and no crash or measured cross-Project latency is claimed.",
        "artifact": null
      }
    ],
    "result_fingerprints": [
      "apps/daemon/src/observations.ts:failed-outcome-retention",
      "packages/watcher/src/rules.ts:unbounded-temporal-samples"
    ],
    "unresolved": [
      "Retained outcome counts, small-fixture growth and terminal-retry cleanup have not been observed in a bounded runtime because complete memory and cumulative disk sandbox controls are unavailable.",
      "Temporal sample retention and cumulative element visits require a bounded instrumented fixture; no saturation, stress or live availability check is authorized."
    ],
    "assignment_group": "events-sources",
    "priority": 6,
    "priority_reason": "Untrusted workload data and at-least-once messages cross into shared incident processing and host collectors.",
    "hardening_notes": [
      "The checked-in consumer declares max_deliver=5, but processQueued has no delivery-count surface or exhausted-processing DLQ handoff. This is a recovery/operability gap; the configuration does prevent a claim of unlimited broker redelivery for an ordinary permanently failing record.",
      "The daemon uses one NATS connection for consuming and Collector publication. The checked-in read user lacks detection-publication permission, while the publication user lacks durable-consumer operations. Effective wiring needs a compatible identity or separate connections. This operator-wiring issue alone does not establish an unauthorized action or deployed exposure.",
      "Docker event buffering has no explicit per-frame byte cap, and Docker/Kubernetes evidence reads primarily limit line counts rather than response bytes. The reviewed origins are operator-selected; no attacker-selected URL or file sink was established. Byte caps and read deadlines would harden these adapters, but upstream runtime limits and a meaningful independent boundary result were not established as a separate finding.",
      "The legacy exported Docker/Kubernetes watch helpers retain abort listeners after a normal sleep resolves. Production Collectors import the shared integrations watch helper, whose sleep removes those listeners. No active daemon listener-leak finding is promoted from the legacy helpers."
    ]
  },
  {
    "coverage_id": "packages%2Fmcp-client%2Fsrc%2Fclient.ts%23createGraveshiftMcp::apps%2Fapi%2Fsrc%2Fmcp%2Fmcp-token.verifier.ts%23McpBearerGuard::apps%2Fapi%2Fsrc%2Fmcp::AI-AND-LLM.md%23MCP%20server%20and%20tool%20identity%20confusion",
    "canonical_refs": {
      "surface": "packages/mcp-client/src/client.ts#createGraveshiftMcp",
      "boundary": "apps/api/src/mcp/mcp-token.verifier.ts#McpBearerGuard",
      "subsystem": "apps/api/src/mcp",
      "attack_class": "AI-AND-LLM.md#MCP server and tool identity confusion"
    },
    "surface": "MCP HTTP/stdio tools, resources, prompts, and API-to-daemon reads",
    "boundary": "Scoped MCP reader to Project context and host-wide collector evidence",
    "subsystem": "apps/api/src/mcp",
    "attack_class": "MCP client connection and tool identity",
    "starting_paths": [
      "apps/api/src/mcp",
      "apps/api/src/stdio.ts",
      "apps/daemon/src/read-handler.ts",
      "apps/daemon/src/reads.ts",
      "apps/daemon/src/routes.ts",
      "apps/daemon/src/private-http.ts",
      "apps/daemon/src/collectors.ts",
      "packages/mcp-client/src",
      "packages/metrics/src"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "AI-AND-LLM.md#Core discipline",
      "AI-AND-LLM.md#MCP server and tool identity confusion",
      "AI-AND-LLM.md#Universal moves",
      "AI-AND-LLM.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in apps/api/src/mcp; this unit covers MCP client connection and tool identity."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-mcp-read",
    "reviewed_paths": [
      "packages/mcp-client/src/client.ts",
      "packages/mcp-client/src/connection.ts",
      "packages/mcp-client/src/transport.ts",
      "packages/mcp-client/src/credential.ts",
      "packages/mcp-client/src/catalog.ts",
      "packages/mcp-client/src/schemas.ts",
      "packages/mcp-client/src/reply.ts",
      "packages/mcp-client/src/retry.ts",
      "packages/mcp-client/src/errors.ts",
      "packages/mcp-client/src/drift.ts",
      "packages/mcp-client/node_modules/@modelcontextprotocol/client/dist/index.mjs",
      "packages/mcp-client/node_modules/@modelcontextprotocol/client/dist/src-CeKsbNLO.mjs",
      "apps/api/src/mcp/mcp.module.ts",
      "apps/api/src/mcp/mcp-token.verifier.ts"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-mcp-read",
        "reviewed_paths": [
          "packages/mcp-client/src/client.ts",
          "packages/mcp-client/src/connection.ts",
          "packages/mcp-client/src/transport.ts",
          "packages/mcp-client/src/credential.ts",
          "packages/mcp-client/src/catalog.ts",
          "packages/mcp-client/src/retry.ts",
          "packages/mcp-client/src/errors.ts",
          "packages/mcp-client/node_modules/@modelcontextprotocol/client/dist/index.mjs",
          "packages/mcp-client/node_modules/@modelcontextprotocol/client/dist/src-CeKsbNLO.mjs",
          "apps/api/src/mcp/mcp.module.ts",
          "apps/api/src/mcp/mcp-token.verifier.ts"
        ],
        "invariant": "A tool result and effective Credential must stay bound to the caller-selected connection and outstanding request through concurrency, Credential override, retry and reconnect.",
        "method": "source",
        "result": "Each client instance owns one transport configuration and SDK Client; there is no multi-server registry, model-selected endpoint, server-name routing or dynamic tool-alias map. Typed wrappers send fixed catalog tool names. HTTP requires a caller-provided Credential; the package reads no ambient Credential store. withConnection serializes operations, installs a per-call Credential only inside that queued operation and restores it in finally. Its transport token callback resolves the active Credential for every HTTP request; the inspected SDK's _commonHeaders sets that token over requestInit Authorization. Retry resets the owned SDK Client, and reconnect creates a fresh instance against the same configuration. The SDK's response-handler map belongs to that Client, unknown IDs are rejected, and close replaces and settles that map. The remote server's advertised name does not choose transport or authority. Stdio commands and custom transports are explicit trusted embedding configuration. No cross-connection result or Credential substitution path was found.",
        "artifact": null
      },
      {
        "agent_id": "hunt-mcp-read",
        "reviewed_paths": [
          "packages/mcp-client/src/client.ts",
          "packages/mcp-client/src/catalog.ts",
          "packages/mcp-client/src/schemas.ts",
          "packages/mcp-client/src/reply.ts",
          "packages/mcp-client/src/drift.ts"
        ],
        "invariant": "Tool names and resource identifiers in decoded replies must not be used to reroute calls or grant a new capability.",
        "method": "source",
        "result": "readPostmortem bounds and percent-encodes its incident id into a fixed resource template, and all resource requests use the owned connection. Tool replies are parsed from text using fixed per-wrapper schemas; error replies fail as tool errors. Catalog descriptions and live catalog replies do not replace the typed method dispatch. The drift checker compares registration names and schema shapes, but it is not relied on as authentication. singleTextResource checks cardinality, text and MIME type but does not compare the returned URI with the requested URI; within this package that is an untrusted-response hardening gap, with no second connection, affected principal or privileged consumer that would establish identity confusion. No candidate survived for this unit.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "mcp-read",
    "priority": 5,
    "priority_reason": "MCP exposes scoped data to agents and crosses from authenticated Project context into daemon source reads.",
    "hardening_notes": [
      "Align the resource permission key in apps/api/src/mcp/mcp.permissions.ts:17 with the registered name Autopsy in apps/api/src/mcp/mcp.resources.ts:16. The inspected installed @nestjs/mcp factory passes the registered name to McpScopeGuard, so the current postmortem key fails closed for authenticated resource calls. A positive-scope HTTP resource case should check that behavior; this is an access failure, not a demonstrated security bypass.",
      "packages/mcp-client/src/reply.ts:48 should compare the single returned resource URI with the requested URI as well as checking text, cardinality and MIME type. Only the caller-selected connection can currently supply that reply, and no separate affected principal or privileged consumer was found, so this remains response-validation hardening."
    ]
  },
  {
    "coverage_id": "powers%2Fgraveshift%2Fmcp.json%23graveshift::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::SUPPLY-CHAIN-AND-RELEASE.md%23Plugin%20and%20extension%20trust%20expansion",
    "canonical_refs": {
      "surface": "powers/graveshift/mcp.json#graveshift",
      "boundary": "scripts/actions/policy-signature.ts#verifyPolicySignature",
      "subsystem": ".github",
      "attack_class": "SUPPLY-CHAIN-AND-RELEASE.md#Plugin and extension trust expansion"
    },
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "subsystem": ".github",
    "attack_class": "Kiro hooks, agents and Power authority",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Plugin and extension trust expansion",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Kiro hooks, agents and Power authority."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ],
    "prior_status": "none",
    "attempts": [],
    "wave": 1,
    "status": "covered",
    "agent_id": "hunt-supply-deploy",
    "reviewed_paths": [
      ".kiro/agents/sre-reviewer.json",
      ".kiro/agents/chaos-witch.json",
      ".kiro/agents/docs-scribe.json",
      ".kiro/settings/mcp.example.json",
      "powers/graveshift/plugin.json",
      "powers/graveshift/mcp.json",
      "powers/graveshift/skills/triage/SKILL.md",
      "apps/api/package.json",
      "apps/api/src/stdio.ts",
      ".kiro/hooks/block-dangerous-shell.json",
      ".kiro/hooks/secret-scan-on-save.json",
      ".kiro/hooks/typecheck-on-save.json",
      ".kiro/hooks/spec-task-done.json",
      ".kiro/hooks/policy-drift.json",
      ".kiro/hooks/test-companion.json",
      ".kiro/hooks/pbt-on-guardrails.json",
      "scripts/kiro/guard-shell.mjs",
      "scripts/kiro/secret-scan.mjs",
      ".kiro/steering/safety.md",
      ".kiro/steering/docker-k8s.md"
    ],
    "local_checks": [
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          ".kiro/agents/sre-reviewer.json",
          ".kiro/agents/chaos-witch.json",
          ".kiro/agents/docs-scribe.json",
          ".kiro/settings/mcp.example.json",
          "powers/graveshift/plugin.json",
          "powers/graveshift/mcp.json",
          "powers/graveshift/skills/triage/SKILL.md",
          "apps/api/package.json",
          "apps/api/src/stdio.ts"
        ],
        "invariant": "The Power and named agents must not silently expand delegated capabilities or substitute a different publisher's executable identity.",
        "method": "source",
        "result": "The Power is explicitly a scaffold and launches the existing local API stdio command, which creates an application context rather than an HTTP listener. It declares no installer/updater, remote publisher replacement, or automatic approval of action tools. The committed MCP example auto-approves only listed read/audit tools; the Kubernetes server is disabled. All three named agents set includeMcpJson:false and deny shell; reviewer exposes read only, while the other agents declare bounded write exclusions. Their intended local same-user installation and workspace-code execution were not treated as a publisher-authenticity boundary. The ignored local MCP settings were not read. The later Compose inheritance issue is owned by the deployment units, not a separate plugin escalation claim.",
        "artifact": null
      },
      {
        "agent_id": "hunt-supply-deploy",
        "reviewed_paths": [
          ".kiro/hooks/block-dangerous-shell.json",
          ".kiro/hooks/secret-scan-on-save.json",
          ".kiro/hooks/typecheck-on-save.json",
          ".kiro/hooks/spec-task-done.json",
          ".kiro/hooks/policy-drift.json",
          ".kiro/hooks/test-companion.json",
          ".kiro/hooks/pbt-on-guardrails.json",
          "scripts/kiro/guard-shell.mjs",
          "scripts/kiro/secret-scan.mjs",
          ".kiro/steering/safety.md",
          ".kiro/steering/docker-k8s.md"
        ],
        "invariant": "Hook event data must not be interpolated into executable shell source or read-file contents echoed as a secret, and advisory developer hooks must not be mistaken for a runtime sandbox.",
        "method": "source",
        "result": "Command hooks use fixed local command strings. guard-shell parses stdin into a command string for regex matching and does not execute it. secret-scan reads the selected file but emits only pattern name and file/line, never the matching secret text. Agent hooks use fixed prompts. The shell regex has bypassable forms and the secret scan is post-save with fail-open unreadable-file behavior, but these are same-user development guardrails rather than a complete authorization/sandbox layer. No source-visible plugin install/update or lower-publisher authority crossing was found; no hook, test or project command was executed.",
        "artifact": null
      }
    ],
    "result_fingerprints": [],
    "unresolved": [],
    "assignment_group": "supply-deploy",
    "priority": 4,
    "priority_reason": "CI and deployment are parallel paths into source mutation, publication tokens and runtime network authority.",
    "hardening_notes": [
      "deploy/compose/bun.Dockerfile copies all apps/packages, while its Dockerfile-specific ignore uses root .env* rather than an explicit recursive nested-secret exclusion. Narrow release inputs or add recursive exclusions for local env/credential artifacts. No ignored secret was read, no actual credential-bearing nested file was established, and no image disclosure is claimed.",
      "apply-patch.ts:71-80 resolves BASE_REF in process.cwd() even though workflow writes and subsequent Git calls use PATCH_WORKSPACE=../target. Existing script fixtures use a single checkout, so they do not establish the two-directory workflow behavior. The source-visible effect is a possible safe publication failure, not a demonstrated unauthorized write.",
      "The documented combined Compose setup also collides on postgres and retains the API profile, command and Dockerfile fields. The unchanged combined run is not established functional. CI validates the two Compose files separately, so it does not settle combined-object behavior. These limitations are retained in the conditional candidate rather than hidden behind a presumed successful deployment.",
      "The actuator proxy's CONTAINERS=1, POST=1, ALLOW_RESTARTS=1 settings require inspection of the pinned external proxy's effective policy. The repository comment alone does not prove restart-only transport, and docker.sock:ro does not independently prevent write requests over a Unix socket. No arbitrary-operation exploit is claimed without a lower-trust source path.",
      "Kubernetes RBAC, permissive egress skeleton, Helm values and kind bootstrap are explicitly incomplete and have no workload attachment. Their broad reads or empty egress rule are dormant scaffold/hardening observations, not evidence of a live cluster or internet exposure.",
      "scripts/kiro/guard-shell.mjs is a substring regex guard, and secret-scan.mjs is post-save and permits unreadable files. They should be described as developer assistance rather than a shell sandbox, full secret prevention control, or publisher boundary. No same-user bypass was elevated to privilege gain.",
      "Mutable image tags, default local/test database placeholders and public-package metadata were not promoted into vulnerabilities without an actor-controlled handoff and affected lower-trust principal. All checks in this result are source inspection; project code, tests, builds, containers, cloud/GitHub commands, external requests and ignored local settings were not used."
    ]
  }
]

Current candidate fingerprints/states:
[
  {
    "fingerprint": "apps/api/src/mcp/mcp.tools.ts:incident-read-embeds-diagnosis",
    "state": "needs_validation"
  },
  {
    "fingerprint": "apps/api/src/work-items/work-item.publication.ts:beginPublication/project-pr-limit",
    "state": "needs_validation"
  },
  {
    "fingerprint": "apps/daemon/src/observations.ts:failed-outcome-retention",
    "state": "needs_validation"
  },
  {
    "fingerprint": "apps/daemon/src/observations.ts:service-cache-project-scope",
    "state": "needs_validation"
  },
  {
    "fingerprint": "apps/daemon/src/reads.ts:collector-evidence-without-project",
    "state": "needs_validation"
  },
  {
    "fingerprint": "daemon/fix-context/service-only-repository-selection",
    "state": "needs_validation"
  },
  {
    "fingerprint": "deploy/compose/api-service-overlay-retains-control-plane-authority",
    "state": "needs_validation"
  },
  {
    "fingerprint": "fixer/recovery/parent-only-publication-binding",
    "state": "needs_validation"
  },
  {
    "fingerprint": "fixer/sandbox/macos-detached-descendant-lifetime",
    "state": "needs_validation"
  },
  {
    "fingerprint": "identity/account-password-change/stale-jwt",
    "state": "needs_validation"
  },
  {
    "fingerprint": "identity/register-addMember/unverified-email-membership",
    "state": "needs_validation"
  },
  {
    "fingerprint": "identity/register-login/unthrottled-argon2-work",
    "state": "needs_validation"
  },
  {
    "fingerprint": "kiro-hooks.guard-shell.event-shape-fail-open",
    "state": "needs_validation"
  },
  {
    "fingerprint": "packages/actuator/createDockerRestarter/compose-project-binding",
    "state": "needs_validation"
  },
  {
    "fingerprint": "packages/actuator/runtimeDecision/zeroed-policy-usage",
    "state": "needs_validation"
  },
  {
    "fingerprint": "packages/events/src/consumer.ts:projectless-event-dedupe",
    "state": "needs_validation"
  },
  {
    "fingerprint": "packages/integrations/src/delivery.ts:permanent-collector-poison-retry",
    "state": "needs_validation"
  },
  {
    "fingerprint": "packages/redactor/src/detectors.ts:email-unanchored-scan",
    "state": "needs_validation"
  },
  {
    "fingerprint": "packages/watcher/src/rules.ts:unbounded-temporal-samples",
    "state": "needs_validation"
  }
]
Prior-ledger gap summary: No compatible prior Graveshift ledger or findings exist. There are no carried prior exclusions.


Immediately after each hunter wave, spend the reserved invocation on one fresh `research` post-wave coverage critic. It receives `architecture.md`, the full coverage ledger including each assignment block map, current candidate fingerprints and states, and the prior-ledger gap summary. It reads source but does not write or run targets. Require exactly this JSON:

```json
{
  "missing_units": [
    {
      "surface": "...",
      "boundary": "...",
      "subsystem": "...",
      "attack_class": "...",
      "starting_paths": ["repo/relative/path"],
      "selected_companion_blocks": ["FILE.md#section"],
      "excluded_blocks": [{"block": "FILE.md#section", "reason": "..."}],
      "reason": "source-backed coverage gap"
    }
  ],
  "reassign_ids": ["existing-id-that-did-not-close"],
  "resolved_prior_leads": ["fingerprint"],
  "stop": false
}
```

The critic checks for unmapped entry points, unchecked parallel paths, missing lifecycle modes, selected companion classes without a unit, unjustified exclusions, units closed without paths/checks, and prior `needs_validation` or changed-source gaps that no unit addresses. It proposes coverage, not findings. `stop` is the critic's own assessment: `true` only when it accepts no `missing_units` and no `reassign_ids`; the parent's loop condition below, not `stop` alone, decides whether another wave runs. For each fingerprint in `resolved_prior_leads`, the parent marks the linked unit or prior-lead entry resolved and records the critic's source-backed reason.

The parent rejects proposed units outside the review scope or source/local boundary, derives canonical IDs for accepted units, and deduplicates them against current units. A prior same-source completed unit may supply evidence; prior `deferred`, `blocked`, `out_of_scope`, or changed-source units become current work and never suppress an accepted unit. Fail rather than merge a canonical ID collision. For each legitimate `reassign_id` with live `blocked`, `covered`, or `candidate` evidence, append that exact terminal record to the unit's `attempts` with the critic's source-backed `reassignment_reason`. Preserve its owner, checks, artifacts, fingerprints, and unresolved facts in that archive. Increment the live `wave`; the next hunter must be a fresh owner and receives an `in_progress` unit with empty live evidence. The hunter's terminal result writes only its new evidence into the live fields. Never copy an archived owner's checks or artifacts into the new live attempt. Sort IDs and validate the ledger before another assignment. In `standard` and `deep`, when the post-wave critic reports no accepted `missing_units` or legitimate `reassign_ids` and no `planned` units remain, spend the separately reserved invocation on a distinct final-clean critic. Complete coverage only when that critic also returns no accepted work. If it finds work, queue it and repeat the wave, post-wave critic, and final-clean process. If time or resources force an early stop, mark every untouched unit `deferred`, preserve the critic's reason, and disclose the gap in the report. Never use a silent wave or agent cap as evidence of complete coverage.

The run profile bounds this loop. A `quick` run has exactly one hunter wave followed by exactly one final critic pass. Add each accepted `missing_unit` to the current ledger and mark it `deferred` with reason `quick_profile_final_critic`. For each legitimate evidence-bearing `reassign_id`, archive the live terminal state in `attempts`, increment `wave`, and set the live state to unassigned `deferred` with empty evidence and reason `quick_profile_final_critic`. Do not launch a second hunter wave or another critic. In a scoped run, the critic still reports out-of-scope gaps it notices, but the parent records them as `out_of_scope` with the critic's reason instead of assigning them. The early-stop rule above is the same mechanism: `quick` is a pre-declared early stop, not evidence of complete coverage.

A budget bounds it the same way. Before assigning each wave, compare remaining budget against its hunter count, the validation reserve, the immediate post-wave critic, and the retained final-clean critic (`quick` reserves only its single final post-wave critic). Shrink the hunter wave to fit, taking units in priority order. If those mandatory reserves do not fit, launch no hunter from that wave and mark its planned units `deferred` with reason `budget_cannot_reserve_critics_and_validation`. Critic-proposed units enter the same ranked queue rather than extending the budget. If surviving candidates exceed the validation reserve, follow the incomplete-run rule in `SKILL.md`: stop hunting, validate in fingerprint order, retain unvalidated units as unresolved candidates, and never present them as findings.


Check unmapped entry points, unchecked parallel paths and lifecycle modes, selected companion classes lacking units, unjustified exclusions, insufficient path/check evidence, and all current planned or unresolved coverage. A needs_validation candidate with an exact sandbox/deployment blocker is already reviewed coverage and need not be reassigned just to rerun blocked execution. Source-grounded missing boundaries require their own stable unit. Do not propose speculative categories absent from this repository. Target scope covers all current product source, examples, CI, hooks and deployment definitions; untracked reports/research_notes are excluded. No ignored env files or credentials may be read.

Return exactly the JSON object in the critic contract. For each reassign_ids item, include a corresponding missing_units entry using that unit's same semantic fields and a reason that explains the source-backed gap; the parent will treat that duplicate tuple as the reason for reopening, not a new unit. Save the same JSON to /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/critic-final/scratch/source-result.json. Do not write elsewhere. No local artifact is permitted or needed.