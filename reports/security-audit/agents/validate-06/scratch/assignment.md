You did not write this candidate. Try to refute it from repository source and bounded
local evidence. Do not contact deployed endpoints or external/shared services. Run
target-controlled code only inside the approved OS-enforced sandbox: no external
network, empty allowlisted environment, read-only target and tools, scratch-only
writes, and explicit low resource and wall-clock limits. If any control is unavailable,
do not execute; retain the exact missing capability as a needs_validation blocker.
Treat every scratch entry as target-controlled after execution. After the sandbox and
all its processes terminate, only trusted parent-side code may promote a predeclared
scratch-relative file, following the promotion procedure block included verbatim in
this prompt. You and target code never write retained artifacts. If promotion is
unavailable or fails, do not use that file as evidence.

1. Verify every trace and evidence file, positive line number, scope, and description.
   Confirm the first entry is a real lower-trust entrypoint and the last is the
   claimed sink or boundary effect.
2. Reconstruct the strongest source-visible validation, identity, authorization,
   normalization, lifecycle, framework, and containment controls on the path.
   Where the architecture summary names a comparable baseline, note whether it
   shares the pattern — as calibration, never as grounds to dismiss.
3. For a proposed confirmed candidate, independently reproduce the minimum observed
   result when possible. Verify inputs, interface shape, conditions, and affected
   dummy principal/resource. Do not infer a stronger result or continue after it.
4. Verify that likelihood, impact, confidence, and the proposed source fix match only
   what the evidence establishes.
5. For a proposed needs_validation candidate, decide whether the blocker is genuinely
   outside source/local observation. If source refutes the trace, reject it. If the
   missing fact remains decisive, keep needs_validation and make the local and
   owner-observed plans exact and non-destructive.
6. Preserve the fingerprint for the same source-derived root cause across every state.

Return exactly one JSON object and no surrounding prose:
{"decision": "confirmed|needs_validation|rejected", "record": { ... }}
where record exactly matches the decision's verdict branch of the schema included
in this prompt. A corrected record replaces the hunter's wording.

Target: /Users/xirothedev/workspace/graveshift
Agent ID: validate-06
You are independent of the hunter and any earlier verifier. Source-only review is required: complete audit sandbox controls are unavailable, including explicit memory and cumulative disk limits. Do not run target code, tests, builds, project scripts or fixture processing. Never contact deployed/shared services or read ignored credential/local-settings files. Do not fabricate observed local behavior.

Candidate/final record to independently assess:
{
  "verdict": "needs_validation",
  "fingerprint": "daemon/fix-context/service-only-repository-selection",
  "title": "Fix repository selection is not bound to the Work Project",
  "description": "A tenant able to publish evidence and initiate an eligible Fix in its own granted Project can name a service mapped by the instance policy to a repository outside that tenant's authority. contextClient checks the tenant's durable diagnosis and Deployment, but chooses the repository solely by service name. If the attacker registers a known commit from that repository as a Deployment in its own Project and the normal Fix policy allows the attempt, the daemon uses its operator GitHub App identity to fetch that repository for the attacker's Fix task. The affected resource is the other principal's repository/source context; the attacker need not possess a GitHub credential or membership in its owning Project. This candidate stops at the unauthorized repository-read/context-selection boundary and does not claim a verified patch, draft PR, merge or code execution. Independent review of the same trace from the patch-execution boundary confirms that repository selection uses only snapshot.item.service, that RepoPolicy has no Project selector, and that the final publication check repeats service membership only; a caller-supplied Deployment SHA in its own Project supplies a syntactically valid commit point.",
  "claimed_root_cause": "Project scope is preserved for Work, diagnosis, detections and Deployment records but is dropped at repository selection. The shared policy's repository records and service-based rules contain no Project grant, and neither contextClient nor prepareSource checks a caller-Project-to-repository authorization before using the instance GitHub identity.",
  "trace": [
    {
      "kind": "entrypoint",
      "file": "apps/api/src/deploys/deploys.service.ts",
      "line": 30,
      "scope": "DeploysService.create",
      "description": "With its own Deployment-write authority, the tenant registers a supplied 40-hex SHA in its own Project. The service checks Organization and Project access, then appends the supplied SHA without repository ownership/provenance binding. This is a required prerequisite, not a Deployment-authentication bypass."
    },
    {
      "kind": "propagation",
      "file": "apps/api/src/auth/services/event-ingest.service.ts",
      "line": 26,
      "scope": "EventIngestService.ingest",
      "description": "The plugin producer supplies service, its own projectId and the registered Deployment. Scope, Project equality, optional Credential service equality and same-Project Deployment lookup are enforced; the service is not resolved to a Project-owned repository."
    },
    {
      "kind": "propagation",
      "file": "apps/daemon/src/observations.ts",
      "line": 181,
      "scope": "createObservations.processOutcome",
      "description": "The Event's diagnosed incident is saved in its Project, converted to a Work item and passed to onWork with that Project. A later eligible Fix remains a command on the attacker's own Work item."
    },
    {
      "kind": "propagation",
      "file": "apps/daemon/src/work-flow.ts",
      "line": 74,
      "scope": "createWorkCommands.fixNow",
      "description": "The command checks the daemon Project grant, reads that Project's Work item, checks Fix eligibility and claims an attempt. The autoFix triage sibling reaches the same runFix path."
    },
    {
      "kind": "propagation",
      "file": "apps/daemon/src/fix-context.ts",
      "line": 42,
      "scope": "contextClient repository resolution",
      "description": "The repository filter compares only repo.services with snapshot.item.service. The unique match is selected before the subsequent caller-Project-bound context checks."
    },
    {
      "kind": "propagation",
      "file": "apps/daemon/src/fix-context.ts",
      "line": 55,
      "scope": "contextClient context binding",
      "description": "Strong diagnosis, service, confidence, category, detection-Project, signal and Deployment-SHA consistency checks bind the durable context, but the returned repo is never checked against caller.projectId."
    },
    {
      "kind": "propagation",
      "file": "apps/daemon/src/run-fix.ts",
      "line": 96,
      "scope": "runOwnedFix policy decision",
      "description": "The open_pr decision and its audit must permit the attempt. Its category/service/signal/counter gates cannot supply the missing Project-to-repository grant."
    },
    {
      "kind": "propagation",
      "file": "apps/daemon/src/fix-execution.ts",
      "line": 111,
      "scope": "prepareFix source preparation",
      "description": "After audit-scope, Deployment-SHA, base-audit and configured-verification checks, the daemon passes input.context.repo, its GitHub client and the Project's Deployment SHA to prepareSource."
    },
    {
      "kind": "propagation",
      "file": "apps/daemon/src/run-fix.ts",
      "line": 90,
      "scope": "runOwnedFix",
      "description": "The claimed attempt resolves context with the authenticated caller and its Project-scoped Work snapshot."
    },
    {
      "kind": "propagation",
      "file": "apps/daemon/src/publication.ts",
      "line": 50,
      "scope": "publishFix",
      "description": "Publication admission persists the chosen repo/branch/base under the caller's Project before invoking the prepared publication; it does not add a repository ownership check."
    },
    {
      "kind": "propagation",
      "file": "packages/fixer/src/open-pr.ts",
      "line": 36,
      "scope": "publicationText",
      "description": "The last repository allowlist gate checks incident.service against repo.services and the patch path rules, with no Project selector."
    },
    {
      "kind": "sink",
      "file": "packages/fixer/src/source.ts",
      "line": 190,
      "scope": "prepareSource GitHub read",
      "description": "client.getCommitTree(repo.repo, baseSha), followed by tree/blob reads, uses the instance GitHub identity without caller Project information. This is the minimum resource-authority boundary requiring validation."
    }
  ],
  "evidence": [
    {
      "file": "apps/api/src/internal/internal-config.controller.ts",
      "line": 19,
      "description": "One daemon grant supplies a Project set alongside a single instance policy and Agent list, rather than a policy/repository mapping for each Project."
    },
    {
      "file": "packages/policy/src/schema.ts",
      "line": 44,
      "description": "Repository entries contain repo, services, base branch and patch constraints, but no Project owner/grant. Rule matching also lacks a Project selector."
    },
    {
      "file": "apps/daemon/src/fix-context.ts",
      "line": 42,
      "description": "Repository selection is the unique service-name match; caller.projectId is used only in later durable API reads and detection checks."
    },
    {
      "file": "apps/api/src/deploys/deploys.controller.ts",
      "line": 63,
      "description": "Deployment creation requires the tenant's legitimate org:ci or project:write authority. The candidate does not assume another Project's Deployment can be borrowed."
    },
    {
      "file": "apps/api/src/deploys/dto/create-deploy.dto.ts",
      "line": 44,
      "description": "Deployment input validates the SHA format and metadata, while DeploysService.create checks the caller's own Project and stores the supplied SHA without repository verification."
    },
    {
      "file": "packages/policy/src/evaluation.ts",
      "line": 8,
      "description": "Policy matching uses action, category, service and signals; confidence, counters and spend gates remain effective, but do not authorize the selected repository for a Project."
    },
    {
      "file": "apps/daemon/src/fix-execution.ts",
      "line": 107,
      "description": "The last controls before source retrieval require a configured verification entry and audited base SHA. They do not inspect repository ownership, and the downstream source API accepts no caller Project."
    },
    {
      "file": "apps/daemon/src/main.ts",
      "line": 94,
      "description": "One command runtime receives all boot.projectIds and one shared boot.policy/contextClient."
    },
    {
      "file": "apps/api/src/auth/services/credential.service.ts",
      "line": 81,
      "description": "A delegated Credential binds the caller's Project and stores the requested service value; it does not reserve that service name across Projects."
    },
    {
      "file": "apps/api/src/auth/services/event-ingest.service.ts",
      "line": 30,
      "description": "Event guards enforce the credential's own Project/service and an own-Project Deployment lookup. They do not establish ownership of a GitHub repository named by a matching global service policy."
    },
    {
      "file": "apps/api/src/deploys/deploys.service.ts",
      "line": 35,
      "description": "Deployment creation correctly checks own-Organization/Project authority, then stores the caller-supplied SHA without associating it with a repository. The DTO checks a 40-hex form."
    },
    {
      "file": "packages/fixer/src/open-pr.ts",
      "line": 36,
      "description": "The final publication target check is service membership only; the GitHub installation is selected later from the resulting repository string."
    }
  ],
  "blockers": [
    "No bounded runtime result was produced. Target-controlled code, fixtures and tests are prohibited because complete OS-enforced memory and cumulative-disk controls have not been established; the artifact promotion allowlist is empty.",
    "The owner must establish that a single daemon is granted mutually untrusted Projects and that a service-mapped repository is intended to be restricted to one of them. A deployment that deliberately shares repository authority across all granted Projects would not establish the claimed cross-principal violation.",
    "The attack requires a known valid commit SHA from the selected repository, Deployment-write authority in the attacker's own Project, an eligible assigned Agent and a normal audited open_pr allow decision. These prerequisites were traced in source but not exercised together.",
    "A second independent review confirms that the selected repository is read with the instance GitHub App and a draft may be written there, but no bounded two-Project fixture observed that result."
  ],
  "validation_plan": {
    "local": "After the parent establishes all required sandbox controls, create two dummy Organizations/Projects granted to one daemon. Give Project A only its own credential, Deployment-write and Fix authority; designate a fake repository as Project B's resource and include its service in the instance policy. Register a known dummy commit in Project A, produce a Project-A Work item with that service and run the normal permitted Fix path using fake durable APIs and a GitHubClient that only records requests. Stop at the first getCommitTree/readBlob call. Verify whether Project A can cause a call for the Project-B repository despite lacking its grant. The regression must deny the repository before any GitHub or provider call, while allowing the same service text with its correctly authorized Project/repository mapping. A second review recommends a fake GitHub repository intended for only one dummy Project: return valid own-Project context for the other Project with the same service and a harmless known base SHA, then record whether contextClient selects the first Project's repository and whether a recording GitHub client receives createPullRequest for it.",
    "deployment": "The owner should inspect the existing daemon Project grant and repository ownership/configuration offline to determine whether the mutually untrusted co-tenancy condition exists. Do not invoke a live Fix, provider or GitHub write."
  }
}

Linked coverage-unit source checks:
[
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::AI-AND-LLM.md%23Tool-argument%20injection%20into%20a%20downstream%20sink",
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
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::AI-AND-LLM.md%23Action-confirmation%20and%20approval%20binding",
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
    ]
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::AI-AND-LLM.md%23Indirect%20injection%20through%20retrieved%20or%20ingested%20content",
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
    ]
  }
]

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


AI-AND-LLM.md#Validation rules

## Validation rules (apply before reporting ANY finding here)

1. Name the crossed boundary and observable result: attacker, affected principal or shared resource, execution identity, target, and unauthorized or unrequested action or disclosure.
2. For confused-deputy authority claims, prove the tool lacks requester-and-resource authorization and that the attacker cannot perform the same action normally. For action-binding claims, instead prove attacker-controlled content caused an action under the affected principal's authority that the principal did not intentionally request or approve. Valid generic authorization does not establish that intent.
3. For memory or retrieval claims, cite both the attacker-controlled write and the later cross-principal read or privileged decision. A shared record without a reachable consumer is not enough.
4. For action binding, establish the intentional request or normalized approved object, if any, and compare it with the object the handler uses. Confirm a locally observable unrequested action, mutation, duplicate, or authority change without extending the test into harmful execution. For schema disagreement, compare the normalized validated object with the handler's object.
5. For MCP identity claims, verify the authenticated connection, request correlation, tool namespace, and effective credential. Mark `needs_validation` if external server identity or deployment routing is required.
6. Return `confirmed` findings only with a complete source trace and meaningful result. Return `needs_validation` for a specific unresolved boundary fact and state the bounded local or owner-observed check needed to resolve it.

Artifact promotion procedure (trusted parent-side code only):
Reference only for you: the parent performs these steps; you never perform them.

Before execution, the parent opens and retains trusted, non-inheritable directory
descriptors for the agent's scratch/ and artifacts/ roots, and records an allowlist
of expected scratch-relative artifact files plus explicit per-file and cumulative
byte limits. Never pass those descriptors to the agent or sandbox. After the sandbox
and all its processes terminate, trusted parent-side code promotes each allowlisted
file separately:

1. Validate the declared relative path: reject absolute, empty, `.`, `..`, or
   symlinked components.
2. Walk each parent component from the retained scratch-root descriptor with
   no-follow directory-relative operations; never reopen by path.
3. Open the leaf no-follow and nonblocking.
4. Verify with `fstat` that it is a regular file with link count exactly one and
   within the recorded per-file and cumulative byte limits.
5. Enforce those limits again while reading from that descriptor.
6. Copy exactly the verified size, repeat `fstat`, and reject a changed identity,
   type, link count, or size.
7. For the destination, walk every parent component from the retained
   artifacts-root descriptor with no-follow directory-relative operations; require
   each existing component to be a real directory, and create any missing directory
   exclusively before reopening and verifying it no-follow.
8. Create the leaf exclusively without following links, verify that the opened
   destination is a regular file with link count exactly one, and copy from the
   verified source descriptor without reopening either path.
9. Use equivalent race-safe APIs on non-POSIX systems.
10. Never recursively copy or glob scratch, extract an archive into artifacts, or
    open or promote a symlink, FIFO, socket, device, directory, hard-linked file,
    changing file, or file that exceeds its bound.
11. If any check is unavailable, cannot be enforced, or fails, discard the scratch
    entry; if it is decisive evidence, retain `needs_validation` with the exact
    promotion blocker.

Report schema, all three branches copied verbatim:
{
  "$comment": "Top-level contract for findings.json. validate-findings.cjs interprets and checks this schema directly.",
  "type": "array",
  "items": {
    "oneOf": [
      {
        "type": "object",
        "description": "A source-grounded vulnerability that was independently demonstrated.",
        "properties": {
          "verdict": {
            "type": "string",
            "const": "confirmed"
          },
          "fingerprint": {
            "type": "string",
            "minLength": 1,
            "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$",
            "description": "A stable source-derived identifier that does not change between validation states."
          },
          "title": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "root_cause": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "intended_behavior": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "trace": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": ["entrypoint", "propagation", "sink"]
                },
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "scope": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["kind", "file", "line", "scope", "description"],
              "additionalProperties": false
            }
          },
          "evidence": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["file", "line", "description"],
              "additionalProperties": false
            }
          },
          "conditions": {
            "type": "array",
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": ["authentication_level", "authorization_role", "user_interaction", "system_configuration", "network_routing", "environmental_dependency", "data_state", "timing_dependency", "third_party_dependency"]
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["kind", "description"],
              "additionalProperties": false
            }
          },
          "execution": {
            "type": "object",
            "description": "Target-neutral reproduction in the target's native interface.",
            "properties": {
              "attacker_perspective": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              },
              "payloads": {
                "type": "array",
                "minItems": 1,
                "uniqueItems": true,
                "items": {
                  "type": "string"
                }
              },
              "instructions": {
                "type": "array",
                "minItems": 1,
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "observed_result": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              }
            },
            "required": ["attacker_perspective", "payloads", "instructions", "observed_result"],
            "additionalProperties": false
          },
          "remediation": {
            "type": "object",
            "properties": {
              "strategy": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              },
              "code_changes": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "file_name": {
                      "type": "string",
                      "minLength": 1
                    },
                    "fixed_code": {
                      "type": "string"
                    }
                  },
                  "required": ["file_name", "fixed_code"],
                  "additionalProperties": false
                }
              }
            },
            "required": ["strategy"],
            "additionalProperties": false
          },
          "severity": {
            "type": "object",
            "properties": {
              "likelihood": {
                "type": "object",
                "properties": {
                  "score": {
                    "type": "string",
                    "enum": ["informational", "low", "medium", "high", "critical"]
                  },
                  "reason": {
                    "type": "string",
                    "minLength": 1,
                    "visibleContent": true
                  }
                },
                "required": ["score", "reason"],
                "additionalProperties": false
              },
              "impact": {
                "type": "object",
                "properties": {
                  "score": {
                    "type": "string",
                    "enum": ["informational", "low", "medium", "high", "critical"]
                  },
                  "reason": {
                    "type": "string",
                    "minLength": 1,
                    "visibleContent": true
                  }
                },
                "required": ["score", "reason"],
                "additionalProperties": false
              },
              "overall_severity": {
                "type": "string",
                "enum": ["informational", "low", "medium", "high", "critical"]
              }
            },
            "required": ["likelihood", "impact", "overall_severity"],
            "additionalProperties": false
          },
          "confidence": {
            "type": "object",
            "properties": {
              "score": {
                "type": "string",
                "enum": ["low", "medium", "high"]
              },
              "reason": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              }
            },
            "required": ["score", "reason"],
            "additionalProperties": false
          }
        },
        "required": ["verdict", "fingerprint", "title", "description", "root_cause", "intended_behavior", "trace", "evidence", "conditions", "execution", "remediation", "severity", "confidence"],
        "additionalProperties": false
      },
      {
        "type": "object",
        "description": "A source-grounded candidate whose decisive validation is blocked.",
        "properties": {
          "verdict": {
            "type": "string",
            "const": "needs_validation"
          },
          "fingerprint": {
            "type": "string",
            "minLength": 1,
            "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$"
          },
          "title": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "claimed_root_cause": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "trace": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": ["entrypoint", "propagation", "sink"]
                },
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "scope": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["kind", "file", "line", "scope", "description"],
              "additionalProperties": false
            }
          },
          "evidence": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["file", "line", "description"],
              "additionalProperties": false
            }
          },
          "blockers": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "string",
              "minLength": 1,
              "visibleContent": true
            }
          },
          "validation_plan": {
            "type": "object",
            "properties": {
              "local": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              },
              "deployment": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              }
            },
            "additionalProperties": false
          }
        },
        "required": ["verdict", "fingerprint", "title", "description", "claimed_root_cause", "trace", "evidence", "blockers", "validation_plan"],
        "additionalProperties": false
      },
      {
        "type": "object",
        "description": "A source-grounded candidate refuted during validation.",
        "properties": {
          "verdict": {
            "type": "string",
            "const": "rejected"
          },
          "fingerprint": {
            "type": "string",
            "minLength": 1,
            "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$"
          },
          "title": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "claimed_root_cause": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "trace": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": ["entrypoint", "propagation", "sink"]
                },
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "scope": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["kind", "file", "line", "scope", "description"],
              "additionalProperties": false
            }
          },
          "evidence": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["file", "line", "description"],
              "additionalProperties": false
            }
          },
          "reason": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          }
        },
        "required": ["verdict", "fingerprint", "title", "description", "claimed_root_cause", "trace", "evidence", "reason"],
        "additionalProperties": false
      }
    ]
  }
}


Prior records with the same fingerprint: none. Your scratch directory: /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/validate-06/scratch/. Parent-owned artifacts directory: /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/validate-06/artifacts/. Promotion allowlist: []; per-file/cumulative byte limits: zero. No target process or local artifact is allowed. You may save your source-only structured reply to /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/validate-06/scratch/source-result.json and must return the same complete JSON in your response; that file is a message copy and is never artifact evidence. Do not write elsewhere. Preserve the fingerprint.

Return exactly {"decision":"needs_validation|rejected","record":{...}} matching the schema. A missing best practice or hypothetical deployment without a concrete lower-trust principal/resource is rejected. A source-supported trace blocked only on exact runtime/deployment evidence remains needs_validation without severity.