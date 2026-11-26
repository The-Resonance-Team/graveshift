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
Agent ID: validate-14
You are independent of the hunter and any earlier verifier. Source-only review is required: complete audit sandbox controls are unavailable, including explicit memory and cumulative disk limits. Do not run target code, tests, builds, project scripts or fixture processing. Never contact deployed/shared services or read ignored credential/local-settings files. Do not fabricate observed local behavior.

Candidate/final record to independently assess:
{
  "verdict": "needs_validation",
  "fingerprint": "packages/actuator/createDockerRestarter/compose-project-binding",
  "title": "Docker restart selection can cross Compose project boundaries",
  "description": "When a Blessing is intended to restart one Project's worker service, a caller holding that fresh signed request can potentially cause the actuator's Docker identity to restart unrelated worker containers in other Compose projects on the same daemon. The writer selects all running containers with the service label and invokes restart for every returned ID. The request can remain exactly as approved and correctly signed; the unresolved issue is which resources that service name resolves to. This requires an enabled act-mode configuration, shared-daemon co-tenancy, per-project approval intent and a proxy that exposes both projects. The checked-in configuration is propose, and the in-repo platform-to-actuator producer is deferred. No deployed exposure or runtime effect was observed.",
  "claimed_root_cause": "The trusted resource resolver in createDockerRestarter authorizes by com.docker.compose.service alone. ActionRequest has no signed Project or Compose-project scope, policy checks only the service name, and the backend neither adds a trusted com.docker.compose.project predicate nor verifies ownership of the returned container IDs before fan-out. A valid approval for one scoped service can therefore name a broader host-level resource set when projects share service names.",
  "trace": [
    {
      "kind": "entrypoint",
      "file": "packages/actuator/src/handler.ts",
      "line": 35,
      "scope": "createActionHandler POST /actions",
      "description": "A request submitter delivers one signed runtime action through the bounded JSON action endpoint."
    },
    {
      "kind": "propagation",
      "file": "packages/actuator/src/execute.ts",
      "line": 95,
      "scope": "createActuator.execute",
      "description": "The executor strictly parses the action and verifies its HMAC; this prevents mutation but authenticates only the resource fields present in the schema."
    },
    {
      "kind": "propagation",
      "file": "packages/actuator/src/claims.ts",
      "line": 62,
      "scope": "admissionDecision",
      "description": "Admission checks the approval identity, action/incident binding, time, policy and action count for the signed service name."
    },
    {
      "kind": "propagation",
      "file": "packages/policy/src/decide.ts",
      "line": 48,
      "scope": "decide runtime allowlist",
      "description": "The explicit target allowlist compares ctx.service to rule service strings and cannot distinguish different Compose projects with the same service name."
    },
    {
      "kind": "propagation",
      "file": "packages/actuator/src/admission-durable.ts",
      "line": 97,
      "scope": "DurableAdmission.claim",
      "description": "A successful unique token/action claim commits before execution. This correctly prevents replay of the request but does not narrow its resolved container membership."
    },
    {
      "kind": "propagation",
      "file": "packages/actuator/src/execute.ts",
      "line": 56,
      "scope": "run Docker restart",
      "description": "The backend receives only action.service; no Project or Compose-project identity is supplied."
    },
    {
      "kind": "propagation",
      "file": "packages/actuator/src/backends.ts",
      "line": 22,
      "scope": "createDockerRestarter.restart container lookup",
      "description": "The Docker list filter contains only com.docker.compose.service=<service>. The returned set is not checked against another ownership predicate."
    },
    {
      "kind": "sink",
      "file": "packages/actuator/src/backends.ts",
      "line": 40,
      "scope": "createDockerRestarter.restart fan-out",
      "description": "The actuator sends POST /containers/<Id>/restart for every returned ID under the host proxy's Docker authority, potentially including the unrelated project's same-named service."
    }
  ],
  "evidence": [
    {
      "file": "packages/actuator/src/types.ts",
      "line": 7,
      "description": "The strict action object includes action/incident IDs, service, runtime, kind and optional replicas, with no Project, Compose-project or deployment selector."
    },
    {
      "file": "packages/actuator/src/sign.ts",
      "line": 18,
      "description": "The signature covers the entire accepted action, approval and context, which prevents tampering but cannot bind a resource scope absent from that object."
    },
    {
      "file": "packages/actuator/src/backends.ts",
      "line": 22,
      "description": "The sole lookup predicate is the Compose service label; lines 38-46 restart every returned container."
    },
    {
      "file": "packages/actuator/src/main.ts",
      "line": 74,
      "description": "The production launcher instantiates this backend from DOCKER_PROXY_URL without an additional Project or Compose-project binding."
    },
    {
      "file": "deploy/compose/graveshift.compose.yml",
      "line": 29,
      "description": "The maintained actuator proxy mounts the host Docker socket and enables container access, POST and restarts. No project-specific filtering is expressed here; effective image and deployment behavior remain unverified."
    },
    {
      "file": "graveshift.config.yaml",
      "line": 62,
      "description": "The committed default mode is propose, so activation of the runtime sink requires an owner-reviewed act-mode configuration."
    },
    {
      "file": "docs/adr/0017-deployment-topology.md",
      "line": 76,
      "description": "The platform-to-actuator producer is described as a future action hop rather than part of the current Fix path. Reachability from a real approval producer must be established separately."
    }
  ],
  "blockers": [
    "No backend or Docker fixture was executed: complete OS-enforced memory and cumulative disk sandbox controls are unavailable, and this assignment prohibits project code, tests, builds, containers and external requests. No local effect or retained artifact exists.",
    "The effective pinned proxy's resource filtering, shared-daemon co-tenancy, enabled act configuration and intended per-project scope of the approval producer were not observed. The manifest alone does not establish a deployed cross-project boundary."
  ],
  "validation_plan": {
    "local": "After the parent supplies the required OS sandbox, use dummy keys and one valid signed worker restart with a scratch-only DurableAdmission and a recording HttpFetch backend. Provide two dummy container records representing distinct Compose projects with the same worker service. Record the actual list filter and restart destinations, and establish that the filter lacks a project predicate and that both IDs reach the stub restart sink. Inspect an available pinned Docker/proxy implementation or isolated dummy daemon to verify the service-label filter semantics. Keep external networking disabled and stop at the recorded wrong-target invocation.",
    "deployment": "Have the owner inspect the rendered active actuator/proxy configuration and workload ownership without submitting a runtime action. Establish whether the proxy can enumerate and restart separate Compose projects, whether same-named services coexist, whether act mode is enabled, and whether each approval is intended to cover one Project. A dedicated daemon or effective resource filter would refute the deployed cross-project condition."
  }
}

Linked coverage-unit source checks:
[
  {
    "coverage_id": "packages%2Factuator%2Fsrc%2Fhandler.ts%23createActionHandler::packages%2Factuator%2Fsrc%2Fexecute.ts%23createActuator::packages%2Factuator::AI-AND-LLM.md%23Action-confirmation%20and%20approval%20binding",
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
    ]
  },
  {
    "coverage_id": "packages%2Factuator%2Fsrc%2Fhandler.ts%23createActionHandler::packages%2Factuator%2Fsrc%2Fexecute.ts%23createActuator::packages%2Factuator::CLOUD-AND-DEPLOYMENT.md%23Namespace%20and%20label%20trust%20confusion",
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

CLOUD-AND-DEPLOYMENT.md#Validation rules

## Validation rules (apply before reporting ANY finding here)

1. Establish the active source path and effective deployment object; otherwise use `needs_validation` and state which rendered manifest or owner-observed attachment is missing.
2. Name the lower-trust caller/workload, cloud or application identity, controllable selector, affected resource, and unauthorized operation or disclosure.
3. Verify provider and orchestrator defaults at the pinned version. Do not assume a public IP, reachable metadata service, permissive firewall, or absent admission attachment.
4. Local validation may render templates, evaluate policy, inspect container/user namespaces in an isolated fixture, or run an emulator with dummy identities. Do not probe live endpoints or alter shared cloud resources.
5. Return `confirmed` only with a complete active source trace and concrete boundary result. Return `needs_validation` with the exact deployed policy, identity attachment, overlay, network, or drift observation needed.

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


Prior records with the same fingerprint: none. Your scratch directory: /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/validate-14/scratch/. Parent-owned artifacts directory: /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/validate-14/artifacts/. Promotion allowlist: []; per-file/cumulative byte limits: zero. No target process or local artifact is allowed. You may save your source-only structured reply to /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/validate-14/scratch/source-result.json and must return the same complete JSON in your response; that file is a message copy and is never artifact evidence. Do not write elsewhere. Preserve the fingerprint.

Return exactly {"decision":"needs_validation|rejected","record":{...}} matching the schema. A missing best practice or hypothetical deployment without a concrete lower-trust principal/resource is rejected. A source-supported trace blocked only on exact runtime/deployment evidence remains needs_validation without severity.