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
Agent ID: validate-05
You are independent of the hunter and any earlier verifier. Source-only review is required: complete audit sandbox controls are unavailable, including explicit memory and cumulative disk limits. Do not run target code, tests, builds, project scripts or fixture processing. Never contact deployed/shared services or read ignored credential/local-settings files. Do not fabricate observed local behavior.

Candidate/final record to independently assess:
{
  "verdict": "needs_validation",
  "fingerprint": "apps/daemon/src/reads.ts:collector-evidence-without-project",
  "title": "Collector evidence selection drops Project authorization",
  "description": "A caller holding an MCP Credential for one granted Project can select any service name for tail_logs and any daemon-allowlisted metric job. The API supplies the authenticated Project and the daemon validates grant membership, but the final collector reads no longer receive that Project. Service inventory also includes all configured collectors. In a deployment where a shared daemon observes evidence reserved for another Project or Organization, the source path would return that evidence using the daemon's Docker, Kubernetes or Prometheus authority. Redaction can remove recognized sensitive strings while leaving private operational log text and numeric metrics visible. This requires a valid narrow-scope MCP Credential, a reachable real Project context, and a collector resource outside that Project's authorized scope; no such disclosure was executed or observed during this source-only review. The Event-driven diagnosis path reaches the same host-wide log reader: observations supplies an Event Project, but the production main callback drops it before ReadRuntime.logs. Ordinary private log text can therefore enter the wrong Project's model context under the same ownership conditions, independently of an MCP HTTP context handoff. No provider request or persisted diagnosis was observed.",
  "claimed_root_cause": "ReadRuntime treats collector evidence as host-wide after checking only whether the caller's Project appears in the daemon grant. Its logs and metric methods have no projectId parameter, inventory is not filtered by Project, CollectorReads has no Project ownership contract, and the configured metric allowlist is global. The service uniqueness check and namespace/job allowlists constrain selection but do not bind the selected resource to the authenticated Project.",
  "trace": [
    {
      "kind": "entrypoint",
      "file": "apps/api/src/mcp/mcp-token.verifier.ts",
      "line": 48,
      "scope": "McpBearerGuard.canActivate",
      "description": "The external MCP caller presents a Credential; verification supplies its stored scopes and Project and attempts to bind that Project for the request."
    },
    {
      "kind": "propagation",
      "file": "apps/api/src/mcp/mcp.permissions.ts",
      "line": 21,
      "scope": "PRIMITIVES",
      "description": "tail_logs requires logs:read and query_metric requires metrics:read, without adding resource ownership restrictions."
    },
    {
      "kind": "propagation",
      "file": "apps/api/src/mcp/mcp.tools.ts",
      "line": 234,
      "scope": "McpTools.tailLogs",
      "description": "The accepted service selector and bounded line count are passed to the backend."
    },
    {
      "kind": "propagation",
      "file": "apps/api/src/mcp/mcp.backend.ts",
      "line": 52,
      "scope": "HttpMcpBackend.read",
      "description": "The API requires the authenticated Project and includes it with the selector in a private daemon request."
    },
    {
      "kind": "propagation",
      "file": "apps/daemon/src/read-handler.ts",
      "line": 72,
      "scope": "createReadHandler",
      "description": "The daemon bearer, strict command schema and granted Project are checked; the logs and metric switch cases then omit projectId when calling ReadRuntime."
    },
    {
      "kind": "propagation",
      "file": "apps/daemon/src/reads.ts",
      "line": 104,
      "scope": "createReadRuntime.logs",
      "description": "The runtime finds the requested service in global collector inventory, requires one matching source and invokes tailLogs without an ownership query."
    },
    {
      "kind": "propagation",
      "file": "packages/sources-docker/src/source.ts",
      "line": 39,
      "scope": "createDockerCollector.containerOf",
      "description": "The Docker variant searches all visible containers only by serviceName; no Project value is available to filter the target."
    },
    {
      "kind": "propagation",
      "file": "packages/sources-docker/src/api.ts",
      "line": 94,
      "scope": "DockerApi.logs",
      "description": "The selected container id is safely encoded and its logs are read using the daemon's configured Docker endpoint authority."
    },
    {
      "kind": "sink",
      "file": "apps/api/src/mcp/mcp.tools.ts",
      "line": 236,
      "scope": "McpTools.tailLogs response",
      "description": "Returned log text is redacted and wrapped, then disclosed to the original MCP caller without checking the selected service's Project."
    }
  ],
  "evidence": [
    {
      "file": "docs/adr/0023-organization-is-the-tenant-root.md",
      "line": 6,
      "description": "The current product serves multiple Organizations in one deployment and derives scope from the authenticated request."
    },
    {
      "file": "apps/daemon/src/main.ts",
      "line": 50,
      "description": "Collectors are bootstrapped with the first granted Project; lines 85-90 construct one shared read runtime from their sources and metric jobs, and lines 129-134 expose it to every granted Project."
    },
    {
      "file": "apps/daemon/src/read-handler.ts",
      "line": 72,
      "description": "The strongest Project gate is membership in options.projectIds. Lines 89-93 discard that Project for log and metric dispatch."
    },
    {
      "file": "apps/daemon/src/reads.ts",
      "line": 77,
      "description": "services(projectId) returns every inventory item and overlays only Project-specific incident state; logs selects global inventory and metric checks a global job-derived allowlist."
    },
    {
      "file": "packages/integrations/src/reads.ts",
      "line": 15,
      "description": "CollectorReads exposes inventory and log reads without any Project argument or ownership field."
    },
    {
      "file": "packages/sources-docker/src/source.ts",
      "line": 139,
      "description": "Docker inventory includes all API-visible containers and log selection resolves only the service name."
    },
    {
      "file": "packages/sources-k8s/src/source.ts",
      "line": 40,
      "description": "Kubernetes filters a daemon-wide namespace list. Lines 171-185 enumerate those deployments and read a selected pod's logs without a requesting Project."
    },
    {
      "file": "apps/daemon/src/collectors.ts",
      "line": 99,
      "description": "metricJobs contains all configured metric-target jobs, with no Project association."
    },
    {
      "file": "apps/daemon/src/reads.ts",
      "line": 113,
      "description": "The metric variant admits exact WATCHER_QUERIES for any configured job and invokes the shared metrics client. Exact query equality prevents arbitrary PromQL but does not provide tenant isolation."
    },
    {
      "file": "apps/api/test/mcp-http.e2e.test.ts",
      "line": 52,
      "description": "The existing HTTP source test replaces MCP_BACKEND, so its success assertions do not establish the real bearer-to-backend Project-context handoff."
    },
    {
      "file": "apps/api/src/mcp/mcp-daemon-read.fixture.ts",
      "line": 130,
      "description": "The adapter fixture substitutes McpProjectContext with a fixed Project, leaving production async-context propagation untested by that fixture."
    },
    {
      "file": "apps/daemon/src/observations.ts",
      "line": 138,
      "description": "The diagnosis path supplies service, 300 lines and the Event Project to its logs callback, then uses the returned logs in the Project-scoped diagnosis."
    },
    {
      "file": "apps/daemon/src/main.ts",
      "line": 121,
      "description": "The production observation logs callback accepts only service and lines and calls the same Projectless ReadRuntime.logs method, dropping the Event Project."
    },
    {
      "file": "packages/diagnoser/src/context.ts",
      "line": 35,
      "description": "Fetched logs become prepared diagnosis evidence; redaction and quotation validation do not add an ownership predicate."
    },
    {
      "file": "packages/gateway/src/gateway.ts",
      "line": 96,
      "description": "The model adapter receives the prepared log context for the active diagnosis, establishing a source-visible alternate output path from the same wrongly scoped reader."
    }
  ],
  "blockers": [
    "No target code, tests, fixtures, builds or services were executed. Complete OS-enforced memory and cumulative-disk sandbox controls are unavailable, so the assignment prohibits the bounded behavioral check needed for confirmation.",
    "The production bearer-guard-to-HttpMcpBackend AsyncLocalStorage Project handoff must be observed with the actual guard and context. Existing inspected tests replace either the backend or Project context; a failed handoff could deny the call before the claimed disclosure.",
    "No live collector configuration, workload ownership or deployment routing was inspected. The claimed cross-Project result needs a dummy fixture that explicitly reserves one collector service or metric job for one Project and grants a different Project access to the same daemon.",
    "The Event-driven variant needs a separate dummy prompt-capture check. It does not depend on the MCP HTTP AsyncLocalStorage handoff; a return of that context through an actual model is not established or required by the minimum claimed prompt-placement result."
  ],
  "validation_plan": {
    "local": "Once the parent establishes a complete OS sandbox, use two dummy numeric Projects, 1 and 2, in the daemon grant. Bind a dummy collector resource private-a and one nonsecret log sentinel to Project 1, then invoke the normal MCP HTTP path with a Project-2 Credential holding logs:read and tail_logs arguments {service:private-a,lines:1}. Keep McpBearerGuard, McpProjectContext, HttpMcpBackend, createReadHandler and createReadRuntime real; replace only infrastructure I/O and durable repositories with non-network dummy adapters. First verify the actual Project arriving at the daemon; if the context handoff fails closed, stop and do not claim disclosure. Otherwise assert that Project 2 receives no Project-1 sentinel. Repeat the same ownership invariant for list_services and a Project-2 metrics:read call using the exact configured query min(up{job=\"private-a\"}) with a distinct dummy numeric sample. Use no external network, no host sockets, an empty allowlisted environment, a read-only target/toolchain, scratch-only writes and low memory, CPU, process, file-size, cumulative-disk and wall-clock limits; stop after one wrong returned record or value. Independently exercise the Event-driven variant with a Project-2 runtime.oom Event naming the Project-1 workload, real observation/log-read composition and a fake model adapter. Stop when a Project-1 nonsecret private-log marker appears in the Project-2 adapter request; no real provider is called.",
    "deployment": "The owner should inspect daemon Project grants, Collector startup ownership and the configured Docker/Kubernetes inventory offline to determine whether mutually private workloads share this evidence reader. Do not read real workload logs or send telemetry to a deployed instance for this check."
  }
}

Linked coverage-unit source checks:
[
  {
    "coverage_id": "apps%2Fapi%2Fsrc%2Fmcp%2Fmcp.module.ts%23GraveshiftMcpModule::apps%2Fapi%2Fsrc%2Fmcp%2Fmcp-token.verifier.ts%23McpBearerGuard::apps%2Fapi%2Fsrc%2Fmcp::DATA-ISOLATION-AND-LIFECYCLE.md%23Missing%20tenant%20or%20owner%20enforcement",
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
  },
  {
    "coverage_id": "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::AI-AND-LLM.md%23Sensitive%20context%20extraction",
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


DATA-ISOLATION-AND-LIFECYCLE.md#Validation rules

## Validation rules (apply before reporting ANY finding here)

1. Name attacker or lower-trust principal, protected data/state, affected owner/tenant, alternate copy or operation, and unauthorized disclosure or mutation.
2. Cite both intended source-of-truth policy and the path that omits or disagrees with it. Confirm another layer does not enforce the same tenant/lifecycle condition.
3. Use local dummy tenants and non-sensitive fixtures to prove cross-scope access or stale lifecycle behavior. Stop at the minimum observable record or operation.
4. If external cache, object storage, replicas, analytics, backup, or retention policy is required, classify `needs_validation` and state the owner-observed check.
5. Return `confirmed` only with complete lineage and concrete boundary impact. Return `needs_validation` with the exact unresolved storage, ACL, invalidation, retention, or restore fact.

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


Prior records with the same fingerprint: none. Your scratch directory: /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/validate-05/scratch/. Parent-owned artifacts directory: /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/validate-05/artifacts/. Promotion allowlist: []; per-file/cumulative byte limits: zero. No target process or local artifact is allowed. You may save your source-only structured reply to /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/validate-05/scratch/source-result.json and must return the same complete JSON in your response; that file is a message copy and is never artifact evidence. Do not write elsewhere. Preserve the fingerprint.

Return exactly {"decision":"needs_validation|rejected","record":{...}} matching the schema. A missing best practice or hypothetical deployment without a concrete lower-trust principal/resource is rejected. A source-supported trace blocked only on exact runtime/deployment evidence remains needs_validation without severity.