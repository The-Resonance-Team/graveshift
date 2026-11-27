# Graveshift security audit

Run: `graveshift-2026-11-25-standard-01`. Profile: **standard**. Status: **complete**.

This standard pass completed the source-review and independent-verification workflow. It does not establish exhaustive coverage of the repository or runtime behavior.

Reviewed source: `d99415203c22eccbefcbee8d7588ccb227534b53 (HEAD; worktree dirty, including untracked example config and research/report documents)`. Source consistency at finish: **all recorded in-scope file hashes unchanged**. Scope covers application/package source, tests, examples, CI, developer hooks, packaging and deployment configuration, including the untracked example config. The untracked Sentry research/report documents are excluded. No prior compatible Graveshift ledger or findings were available; there are no carried same-source confirmations or changed-source revalidations.

Execution policy: **sandboxed-source-and-local-only**. The initial source-only pass was followed by bounded local checks that executed target modules inside an OS-enforced Linux container. The container enforced `--network none`, a read-only root filesystem with source mounted read-only, scratch-only size-bounded tmpfs writes, 512 MiB memory, one CPU, 64 PIDs, file/process/CPU ulimits and a hard wall-clock timeout, using the pinned `oven/bun:1.4.4` image already present on the host. No dependencies were installed, no real credentials used, no provider, GitHub, broker, database or deployed endpoint contacted, and no target artifact promoted. Harness outputs were captured as trusted parent-side records in validation/results/.

Budget: no user-set cap. 91 agent invocations were used. The initial plan reserved four reconnaissance calls, eleven hunter calls, an immediate post-wave critic, a distinct final-clean critic, and two fresh verifier calls per surviving candidate; the later bounded-validation phase added five harness-authoring agents, one Compose render, and one fresh confirmation verifier per confirmed record. All invocations are recorded in run-agent-log.json.

## Security posture

19 confirmed findings, 0 unresolved validation leads and 0 rejected hypotheses. The confirmed findings were established with dummy data in the compliant container and then independently re-verified from source. Their demonstrated impact is limited to the fixture preconditions recorded on each record; operational severity for a specific deployment still depends on the co-tenancy, configuration and exposure facts named in each record.

## Confirmed findings

| Severity | Title | Boundary | Observed result |
| --- | --- | --- | --- |
| medium | Incident tool responses include Diagnoses without the diagnoses:read scope | Authorization is applied to primitive names while the incident tools reuse the full RecordedHaunting response shape. That shape includes the very Diagnosis object protected by the separate get_diagnosis permission. Generic string redaction preserves the object and its nonsecret private content, so it does not enforce the missing capability at the response projection. | Both list_incidents and get_incident return the diagnosis root-cause sentinel. The permission map separates get_incident (incidents:read) from get_diagnosis (diagnoses:read), yet incident reads carry diagnosis content with no scope-aware projection. |
| medium | Concurrent Work attempts can reuse a stale Project PR-limit decision | The Project-wide policy count is read and evaluated outside the publication transaction. Claimed/running attempts do not consume publicationCount, and beginPublication neither rechecks the configured maximum nor atomically reserves a Project-wide slot. Serializable transactions, command-scoped advisory locks, the audit pre-effect acknowledgment and Work version/attempt/lease fences protect individual commands and Work records after the stale decision, so they do not bind publication to the shared limit that authorized it. | Both distinct work-item/attempt pairs were admitted by the real beginPublication (both snapshots show state 'publishing' with a saved publication intent), with maxOpenPrsPerHour=1 and publicationCount reading zero at each admission. beginPublication (work-item.publication.ts:22-58) performs only per-attempt fencing (loadWork, activeAttempt, requireCommand, requireLiveLease, fenceWork, fenceAttempt) and never consults publicationCount, maxOpenPrsPerHour, openPrsLastHour, or any project-wide reservation (limit tokens found inside function: []). No project-wide PR limit blocks the second publication intent. |
| low | Permanent Haunting-write failures retain expanding observation histories | The in-memory pending outcome cache has success-only cleanup and no terminal-failure, size or expiry policy. Public Event-ID validation is incompatible with derived internal idempotency-key limits, supplying a deterministic permanent-error trigger. createGrouper returns a deep clone of each cumulative group, so each abandoned pending outcome retains its own history rather than only one bounded reference. | Every permanently failed outcome stayed in pending: three unique ids produced three sets and zero deletes; the three retries skipped the active lookup (retained-outcome path) and re-attempted the write, so retention grows linearly with failures with no eviction. |
| medium | A co-tenant Event can prevent release of another Project's closed Haunting group | createObservations stores active IDs in byService under service alone (lines 42, 50, 69, 92-97), whereas createGrouper stores open groups under [detection.projectId,detection.service] (pipeline.ts:44). Cache deletion, replacement and release therefore refer to different namespaces: B's null-active lookup deletes A's service-only cache ID while release(B,A-id) is refused by the grouper's Project equality check (pipeline.ts:79). Durable Project checks in HauntingRepo.upsert (haunting.repo.ts:28,47-57) protect row ownership and monotonic updates but do not repair the stale group, and haunting.mapper.mergeRecorded/hauntingData preserve the prior closed incident state on the appended detection. | createObservations keys byService solely by service name. The project B warning for checkout cleared that shared entry and its release was scoped to B, so when A was resolved and a fresh A runtime.oom arrived after the dedupe window, no A-scoped release occurred: the stale watcher grouper entry reused A incident id, and write() merged the new detection into the resolved row (state stays resolved), leaving no new active Haunting. |
| medium | Collector evidence selection drops Project authorization | ReadRuntime treats collector evidence as host-wide after checking only whether the caller's Project appears in the daemon grant. Its logs and metric methods have no projectId parameter, inventory is not filtered by Project, CollectorReads has no Project ownership contract, and the configured metric allowlist is global. The service uniqueness check and namespace/job allowlists constrain selection but do not bind the selected resource to the authenticated Project. | createReadRuntime exposes logs(service, lines) with no Project parameter; the Collector inventory is host-wide. A source reserved for Project A was reached by a project-less logs() call (sentinel returned), and the same reserved inventory appeared in services(projectB) as well as services(projectA). Project A evidence is reachable without a Project binding. |
| medium | Fix repository selection is not bound to the Work Project | Project scope is preserved for Work, diagnosis, detections and Deployment records but is dropped at repository selection. The shared policy's repository records and service-based rules contain no Project grant, and neither contextClient nor prepareSource checks a caller-Project-to-repository authorization before using the instance GitHub identity. | contextClient selects the repository solely with policy.github.repos.filter(repo => repo.services.includes(snapshot.item.service)) at lines 42-46; caller.projectId is used only in the later internal API reference, never in selection. With caller.projectId=projB and a snapshot whose service maps to the sole repo, the real contextClient still returned that repo, and caller.projectId=projA returned the identical repo. |
| medium | Combined Compose service identity can carry platform authority into the demo image | deploy/compose/graveshift.compose.yml and deploy/compose/demo.compose.yml assign different trust roles to the same Compose service key api. The later demo definition overrides image and build.context but, in source, contains no environment/network/profile/command/build.dockerfile reset directives, so under standard Compose merge the platform API's credential environment, core network, api profile, src/main.ts command and deploy/compose/bun.Dockerfile path can be retained. An actor with write authority confined to examples/** can then control the selected image's build and runtime inputs without editing platform configuration. The source-visible prerequisites (api profile co-enablement, nonempty owner credentials, and a runnable examples-supplied variant supplying the absent Dockerfile/entrypoint) are not established as met. | When the api profile is enabled, the merged services.api selects the examples-controlled image while retaining the platform credential environment fields and the core network. The unchanged pair fails Compose v5 validation because of a duplicate security_opt item; resolving that in a scratch copy produced the rendered result. |
| medium | Publication recovery can accept a same-parent head with unverified content | The immutable object identity is lost when planPublication reduces the receipt to repo/branch/baseSha and PublicationIntent persists only those fields. getExistingDraft binds the current head/ref to the base parent but does not bind its tree or head digest to the original verified result. Both existing-draft reuse and uncertain-effect reconciliation trust this weaker identity. | The substituted head was accepted by both getExistingDraft and the real recoverPublication wrapper. getExistingDraft (rest.ts:140-183) validates only that the draft head sha matches the ref and that the head commit has exactly one parent equal to baseSha (rest.ts:168-175); it never reads the commit tree or compares it to the originally verified tree digest. The persisted PublicationPlan (verified-publication.ts:8-12) contains only repo/branch/baseSha, so no expected-tree binding is possible. Two distinct trees with the same single parent are therefore interchangeable at recovery time. |
| low | macOS verifier cleanup targets one process group instead of all descendants | sandbox.execute treats process.kill(-child.pid) as complete teardown and resolves only from child.close. The macOS sandbox profile allows fork and same-sandbox child groups but supplies no descendant supervisor or process namespace. Changing session/group therefore falls outside the only kill target, while neither the timer nor verification independently terminates the pending operation or proves all writers are gone. | A detached descendant kept running and wrote inside the workspace after runSandboxed returned, showing cleanup targeted only the original process group. |
| medium | Password changes leave other pre-change Account bearers usable | Account JWTs contain no session identifier or password epoch. setPassword changes only passwordHash and mustChangePassword, while AccountAuthGuard verifies the static signing key and current Account/Membership state without checking an issuance epoch or revocation state. Clearing mustChangePassword therefore affects every unexpired token for that Account, including separately held first-login tokens. Preserving the current password-changing session may be intentional, but this representation cannot invalidate other sessions separately. | With dummy ids and a local HS256 stub, two logins produced distinct session tokens. After changePassword updated the stored hash via the service and fake repo, the first bearer was still accepted by the real AccountAuthGuard. The token carries only sub/email/standard JWT claims; no password epoch or revocation field exists, and the guard re-reads Account/membership state without comparing token issuance to the password change. |
| medium | Email-based member addition can select an attacker who registered the intended member's email first | register treats syntactic email validity as sufficient to reserve the global Account identity. addMember subsequently treats the same unverified email as the authority for selecting the person who receives a protected Membership. There is no mailbox-verification state or email-bound invitation acceptance between those two operations. The owner check is present and correctly scoped, but it authenticates the grantor without authenticating the intended recipient's email ownership. | With dummy principals and an in-memory repo, an unauthenticated-style register reserved the intended member email using an attacker password. The owner then added that plain email and IdentityService.addMember resolved it directly to the attacker Account. The attacker, previously denied the Project list, could then list the owner Organization’s dummy Project. No mailbox-verification or invitation-acceptance state exists on this path. |
| low | Public identity routes bypass the configured throttle before password work | ThrottlerModule is configured without a global guard, and the public identity controller omits the per-route guard that OAuth token exchange explicitly installs. The identity service submits password work without a source-visible per-IP/global work budget or submission bound. Per-field and parser size limits do not stop repeated small requests. Runtime worker limits and deployed upstream controls may constrain the impact and are not assumed absent. | Runtime metadata shows no guards on AccountController.register/login while OAuthController.token carries ThrottlerGuard. With Bun.password.hash/verify replaced by counting fakes, small dummy register/login requests reached password hashing and verification, including a failed login that still performed verify work. This confirms the localized admission gap and input-to-work path; it does not measure a service outage or decide upstream/runtime work limits. |
| low | Kiro shell hook guard guesses the event shape and fails open outside a finite command denylist | The guard treats unverified, event-supplied structure as trusted control input: `extractCommand` enumerates guessed JSON paths and falls back to allow (exit 0) whenever the actual event shape differs, and enforcement is a literal regex that misses semantically equivalent destructive commands. The event-shape, hook-enforcement, and hook-principal facts needed to decide whether a lower-trust tool/save event can reach that fail-open path are external to the repository and cannot be assumed. | The real guard blocked the recognized literal shape (exit 2) and allowed a benign command (exit 0), but exited 0 both for a destructive command nested in an unprobed event shape and for the semantically equivalent "rm -rf /;true". That is the fail-open / missing regex boundary result, observed from exit codes only with dummy stdin; no shell command was executed. |
| medium | Docker restart selection can cross Compose project boundaries | The trusted resource resolver in createDockerRestarter authorizes by com.docker.compose.service alone. ActionRequest has no signed Project or Compose-project scope, policy checks only the service name, and the backend neither adds a trusted com.docker.compose.project predicate nor verifies ownership of the returned container IDs before fan-out. A valid approval for one scoped service can therefore name a broader host-level resource set when projects share service names. | The list filter contains only the com.docker.compose.service label with no project predicate; both containers (dummy-project-alpha and dummy-project-beta) were POST-restarted. |
| medium | Runtime admission substitutes zero for authoritative policy usage | claims.runtimeDecision reconstructs SharedPolicyContext with diagnosisLoops: 0 and llmSpentTodayUsd: 0 for every request. These are authoritative state facts, not known-zero properties of a runtime operation. ContextSchema cannot carry them, AdmissionRules has no usage reader, and neither SQLite admission nor API ActionRepo resolves the recorded Project/incident usage before calling this helper. PolicyContextService and AuditRepo already demonstrate the authoritative values and fail-closed handling elsewhere, but runtime admission bypasses that dependency. | The full SharedPolicyContext is denied as rate_limited by the positive diagnosisLoops/daily-spend limits, but runtimeDecision returns no denial because it zeroes diagnosisLoops and llmSpentTodayUsd. |
| medium | Event replay keys cross Project boundaries | Project authority is present in the subject and body but omitted from replay identity: createNatsPublisher sends msgID=prepared.id and processQueued checks/marks a single shared Set using envelope.id. The API preserves producer-chosen IDs and does not establish global uniqueness. A 100000-entry size bound limits retained keys but does not isolate them. | Dedupe is keyed on envelope.id alone: project 202 reused id "same-envelope-id", was acknowledged on the dedupe branch, and never reached the process callback (which would have produced runtime.oom). |
| low | A permanently rejected workload name can block the shared Collector queue | createDeliveryQueue retries all entry.deliver and publisher errors indefinitely without distinguishing permanent validation failures, enforcing an attempt/deadline limit, or quarantining the head record. Both Collectors prepare workload-derived service metadata inside entry.deliver, where assertSafeMetadata can always reject it. The queue's 256-record bound and one-second manual stop deadline do not allow healthy records past that head during normal operation. | The retry loop has no attempt cap: the head record threw on every delivery, so entries() kept yielding pending[0]; the healthy record never reached deliver() and the publisher received nothing. |
| low | Allowed telemetry strings may cause superlinear synchronous redaction before truncation | The shared redactor applies an unanchored, potentially quadratic email regex synchronously to caller-controlled strings without a per-string work budget. Sentry eventType invokes it before the only type-length truncation. The strongest visible controls are the one-MiB Sentry raw/parser caps, the plugin default 65,536-byte and maximum 102,400-byte cap, client request throttling, four redaction passes, and a downstream 128-KiB stream message limit. They bound request count, total bytes, passes, or final publication size, but do not establish linear regex work or preempt a synchronous call. Whether the supported Bun engine optimizes this pattern enough to prevent meaningful shared impact is unresolved. | Each doubling of a non-matching ASCII string more than doubled redact() time (exponent > 1.5), consistent with the unanchored email pattern backtracking from every start index. |
| low | Caller timestamps can grow temporal watcher arrays without a bound | Temporal counting stores every matching timestamp in unbounded arrays and ages them only relative to the next untrusted observedAt. There is no count cap or independent expiration. The 10000-entry replay-ID set bounds only identity storage, and detection dedupe happens after the arrays have already grown and been copied. | Doubling unique error lines from 8 to 16 grew filter callback visits 4.29x (quadratic n(n-1)/2), and all samples were retained (8 -> 16) with no eviction cap on the error array. |

## Incident tool responses include Diagnoses without the diagnoses:read scope

Severity: **medium**. Fingerprint: `apps/api/src/mcp/mcp.tools.ts:incident-read-embeds-diagnosis`.

A valid MCP Credential can be issued with incidents:read while omitting diagnoses:read. Both MCP scope layers deny that Credential's direct get_diagnosis call, yet list_incidents and get_incident return the complete stored incident object, including Diagnosis rootCause, evidence excerpts, confidence and references. The affected data belongs to the Credential's own Project; the crossed boundary is the delegated MCP capability for reading Diagnoses. The source trace retains Project isolation but contains no scope-aware removal of the embedded Diagnosis. The tool-layer boundary result was observed with dummy data inside the compliant container.

Root cause: Authorization is applied to primitive names while the incident tools reuse the full RecordedHaunting response shape. That shape includes the very Diagnosis object protected by the separate get_diagnosis permission. Generic string redaction preserves the object and its nonsecret private content, so it does not enforce the missing capability at the response projection.

Intended behavior: A Credential holding incidents:read but not diagnoses:read must not receive Diagnosis content.

### Source trace

1. [apps/api/src/mcp/mcp.permissions.ts:14](/Users/xirothedev/workspace/graveshift/apps/api/src/mcp/mcp.permissions.ts:14) — **entrypoint**, PRIMITIVES and canCallMcpMethod: An incidents:read Credential is admitted to get_incident while the distinct get_diagnosis mapping requires diagnoses:read.
2. [apps/api/src/mcp/mcp.tools.ts:94](/Users/xirothedev/workspace/graveshift/apps/api/src/mcp/mcp.tools.ts:94) — **propagation**, McpTools.getIncident: The tool requests the complete incident view for the supplied identifier.
3. [apps/api/src/mcp/mcp.backend.ts:72](/Users/xirothedev/workspace/graveshift/apps/api/src/mcp/mcp.backend.ts:72) — **propagation**, HttpMcpBackend.getIncident: The backend requires Project context and parses the daemon response as RecordedHaunting, which allows a full embedded Diagnosis.
4. [apps/daemon/src/read-handler.ts:83](/Users/xirothedev/workspace/graveshift/apps/daemon/src/read-handler.ts:83) — **propagation**, createReadHandler incident dispatch: After daemon authentication and grant validation, the handler passes Project and id into the incident read.
5. [apps/daemon/src/reads.ts:91](/Users/xirothedev/workspace/graveshift/apps/daemon/src/reads.ts:91) — **propagation**, createReadRuntime.incident: The daemon reads the full durable Haunting through the private API using Project and id.
6. [apps/api/src/hauntings/haunting.repo.ts:81](/Users/xirothedev/workspace/graveshift/apps/api/src/hauntings/haunting.repo.ts:81) — **propagation**, HauntingRepo.get: The correct composite Project/id query returns the recorded Haunting; it does not know the external MCP tool's scopes.
7. [apps/api/src/hauntings/haunting.mapper.ts:24](/Users/xirothedev/workspace/graveshift/apps/api/src/hauntings/haunting.mapper.ts:24) — **propagation**, toRecordedHaunting: The mapper preserves the stored incident and its embedded Diagnosis while prepareRecordedHaunting redacts sensitive text.
8. [apps/api/src/mcp/mcp.tools.ts:95](/Users/xirothedev/workspace/graveshift/apps/api/src/mcp/mcp.tools.ts:95) — **sink**, McpTools.getIncident response: The entire view is returned through deepRedact with no conditional removal of incident.diagnosis. listIncidents has the same projection at line 86.

### Evidence

- [apps/api/src/mcp/mcp.permissions.ts:11](/Users/xirothedev/workspace/graveshift/apps/api/src/mcp/mcp.permissions.ts:11) — The explicit primitive map separates incident-read tools from get_diagnosis and its diagnoses:read scope.
- [apps/api/src/auth/services/credential.service.ts:82](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/services/credential.service.ts:82) — Issued Credentials store the requested narrow scope set. Verification returns record.scopes at line 122 rather than widening incidents:read to diagnoses:read.
- [apps/api/src/auth/scopes.ts:46](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/scopes.ts:46) — incidents:read and diagnoses:read are separately issuable MCP scopes. Their shared canonical OAuth alias does not add the other MCP scope during Credential verification.
- [apps/api/src/mcp/mcp.tools.ts:85](/Users/xirothedev/workspace/graveshift/apps/api/src/mcp/mcp.tools.ts:85) — listIncidents returns sliced complete backend views; getIncident at line 94 returns one complete view. Neither receives scopes or removes Diagnosis fields.
- [packages/core/src/schemas.ts:74](/Users/xirothedev/workspace/graveshift/packages/core/src/schemas.ts:74) — IncidentSchema contains optional Diagnosis, whose schema at line 64 includes rootCause, evidence, confidence and createdAt.
- [packages/core/src/recorded.ts:43](/Users/xirothedev/workspace/graveshift/packages/core/src/recorded.ts:43) — RecordedHauntingSchema retains the full optional Diagnosis. prepareRecordedHaunting at line 100 preserves it while redacting rootCause and evidence text.
- [apps/api/src/mcp/mcp.redact.ts:4](/Users/xirothedev/workspace/graveshift/apps/api/src/mcp/mcp.redact.ts:4) — deepRedact recursively processes strings and keys, with no knowledge of the caller's capabilities and no Diagnosis-field removal.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"sentinel":"DIAG_SENTINEL_ZZTOP_42","listIncidentsHasSentinel":true,"getIncidentHasSentinel":true,"returnedDiagnosisText":"root cause marker DIAG_SENTINEL_ZZTOP_42","permission":{"get_incident_with_incidents_read":true,"get_incident_with_diagnoses_read":false,"get_diagnosis_with_incidents_read":false,"get_diagnosis_with_diagnoses_read":true},"scopeSeparation":true,"envMode":null}
```

1. Run 01-mcp-diagnosis-scope.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: Both list_incidents and get_incident return the diagnosis root-cause sentinel. The permission map separates get_incident (incidents:read) from get_diagnosis (diagnoses:read), yet incident reads carry diagnosis content with no scope-aware projection.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires a narrow-scope MCP Credential and an existing diagnosis.

Impact: Discloses private Diagnosis content within the Credential's own Project.

Smallest effective fix: Project incident responses by the caller's MCP scopes, removing incident.diagnosis before deepRedact whenever diagnoses:read is absent; add a two-Credential regression test.


## Concurrent Work attempts can reuse a stale Project PR-limit decision

Severity: **medium**. Fingerprint: `apps/api/src/work-items/work-item.publication.ts:beginPublication/project-pr-limit`.

An OAuth client holding tokens:manage and fix:trigger may start fixes for two distinct eligible Work items in its granted Project. With maxOpenPrsPerHour set to one and no recent publication, both attempts can read zero before either saves an intent. The source evaluates that counter before routing and patch preparation, then admits each publication using only its own Work/attempt/lease checks. The hypothesized result is two draft-publication admissions under the owner's one-per-hour policy. The two-admission result was observed with dummy Work items inside the compliant container. The actuator baseline reserves a durable single-use slot before execution; this fix path has no analogous Project-wide reservation.

Root cause: The Project-wide policy count is read and evaluated outside the publication transaction. Claimed/running attempts do not consume publicationCount, and beginPublication neither rechecks the configured maximum nor atomically reserves a Project-wide slot. Serializable transactions, command-scoped advisory locks, the audit pre-effect acknowledgment and Work version/attempt/lease fences protect individual commands and Work records after the stale decision, so they do not bind publication to the shared limit that authorized it.

Intended behavior: The configured maxOpenPrsPerHour limit must bound Project-wide publication admissions.

### Source trace

1. [apps/api/src/work-items/controllers/work-items.controller.ts:159](/Users/xirothedev/workspace/graveshift/apps/api/src/work-items/controllers/work-items.controller.ts:159) — **entrypoint**, WorkItemsController.fixNow: An authenticated management client with fix:trigger submits separate Fix now commands for two Work IDs; caller() supplies the principal's Project and actor. The same downstream policy path also handles automatic triage.
2. [apps/daemon/src/work-flow.ts:74](/Users/xirothedev/workspace/graveshift/apps/daemon/src/work-flow.ts:74) — **propagation**, createWorkCommands.fixNow: The daemon verifies the caller Project, checks replay and eligibility, claims the selected Work item and invokes runFix. Distinct Work items and command IDs do not share a Work fence.
3. [apps/daemon/src/run-fix.ts:90](/Users/xirothedev/workspace/graveshift/apps/daemon/src/run-fix.ts:90) — **propagation**, runOwnedFix: Each live attempt resolves its own context before evaluating policy. No Project-wide publication slot is acquired at this point.
4. [apps/daemon/src/fix-context.ts:54](/Users/xirothedev/workspace/graveshift/apps/daemon/src/fix-context.ts:54) — **propagation**, contextClient: The daemon obtains shared policy facts from the API's Project-qualified internal context endpoint.
5. [apps/api/src/internal/policy-context.service.ts:31](/Users/xirothedev/workspace/graveshift/apps/api/src/internal/policy-context.service.ts:31) — **propagation**, PolicyContextService.resolve: After the Project grant and Diagnosis checks, resolve requests publicationCount and returns it as counters.openPrsLastHour. This read does not reserve capacity for the attempt.
6. [apps/api/src/work-items/work-item.repo.ts:106](/Users/xirothedev/workspace/graveshift/apps/api/src/work-items/work-item.repo.ts:106) — **propagation**, WorkItemRepo.publicationCount: Only attempts in the Project with non-null publication and recent updatedAt count. Both claimed/running attempts can therefore observe the same zero while neither has reached beginPublication.
7. [apps/daemon/src/run-fix.ts:96](/Users/xirothedev/workspace/graveshift/apps/daemon/src/run-fix.ts:96) — **propagation**, runOwnedFix: The daemon computes one open_pr policy decision from those facts and, after audit acknowledgment, continues on allow through routing and patch preparation without refreshing the PR counter.
8. [packages/policy/src/evaluation.ts:35](/Users/xirothedev/workspace/graveshift/packages/policy/src/evaluation.ts:35) — **propagation**, gate: The intended control denies an open_pr action when openPrsLastHour is at least maxOpenPrsPerHour. Two earlier zero snapshots both pass a configured maximum of one.
9. [apps/daemon/src/publication.ts:45](/Users/xirothedev/workspace/graveshift/apps/daemon/src/publication.ts:45) — **propagation**, publishFix: The acknowledged pre-effect audit is followed by runtime.beginPublication. Neither operation refreshes the earlier shared-cap decision.
10. [apps/api/src/work-items/work-item.repo.ts:221](/Users/xirothedev/workspace/graveshift/apps/api/src/work-items/work-item.repo.ts:221) — **propagation**, WorkItemRepo.lockCommand and change: The publication change runs in a serializable transaction after locking the Project/command pair. Different command IDs have different locks, and the transaction does not include the prior policy-counter read.
11. [apps/api/src/work-items/work-item.publication.ts:29](/Users/xirothedev/workspace/graveshift/apps/api/src/work-items/work-item.publication.ts:29) — **propagation**, beginPublication: The durable boundary checks only this Work snapshot, active attempt, owning command, live lease and absence of prior publication; it then saves the publishing intent and audit. It never checks or reserves maxOpenPrsPerHour across other Work items.
12. [apps/daemon/src/publication.ts:55](/Users/xirothedev/workspace/graveshift/apps/daemon/src/publication.ts:55) — **sink**, publishFix: Each admitted attempt reaches prepared.publish after its own saved intent. A bounded local fixture should stop at two mock draft-publisher invocations or two durable publication intents under the configured maximum of one.

### Evidence

- [docs/adr/0008-fix-paths-and-safety.md:9](/Users/xirothedev/workspace/graveshift/docs/adr/0008-fix-paths-and-safety.md:9) — Both fix triggers require policy allow before a draft pull request; this is an explicit owner policy boundary.
- [packages/policy/src/schema.ts:35](/Users/xirothedev/workspace/graveshift/packages/policy/src/schema.ts:35) — maxOpenPrsPerHour is a configured nonnegative integer limit.
- [packages/policy/src/evaluation.ts:33](/Users/xirothedev/workspace/graveshift/packages/policy/src/evaluation.ts:33) — The open_pr gate compares openPrsLastHour against that configured maximum.
- [apps/api/src/work-items/work-item.repo.ts:109](/Users/xirothedev/workspace/graveshift/apps/api/src/work-items/work-item.repo.ts:109) — The publication counter includes saved intents/known references but excludes attempts with null publication.
- [apps/api/src/work-items/work-counter.database.spec.ts:108](/Users/xirothedev/workspace/graveshift/apps/api/src/work-items/work-counter.database.spec.ts:108) — The source regression expects zero publications after claiming and one only after beginPublication; the test was read, not executed.
- [apps/daemon/src/run-fix.ts:96](/Users/xirothedev/workspace/graveshift/apps/daemon/src/run-fix.ts:96) — Policy is evaluated before routing and execute preparation; publication later uses that decision without another PR-count gate.
- [apps/api/src/work-items/work-item.publication.ts:29](/Users/xirothedev/workspace/graveshift/apps/api/src/work-items/work-item.publication.ts:29) — The strongest durable publication admission checks ownership, versions, live lease and saved intent, but not shared Project capacity.
- [apps/api/src/work-items/work-item.repo.ts:221](/Users/xirothedev/workspace/graveshift/apps/api/src/work-items/work-item.repo.ts:221) — Command locks include commandId and the serializable change transaction starts after the remote policy read; neither binds distinct Work publications to a cap reservation.
- [apps/daemon/src/command-lifetime.ts:8](/Users/xirothedev/workspace/graveshift/apps/daemon/src/command-lifetime.ts:8) — The production drain wrapper starts each command promise and tracks it in a pending set; it does not serialize commands. main wires this wrapper to createCommandHandler.
- [apps/daemon/src/publication.ts:55](/Users/xirothedev/workspace/graveshift/apps/daemon/src/publication.ts:55) — The actual publication sink runs after individual admission, with no additional Project PR-limit check on this path.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"maxOpenPrsPerHour":1,"distinctWorkItems":2,"distinctAttempts":2,"publicationCountReadAtEachAdmission":[0,0],"publicationCountAfterBothAdmissions":0,"admissions":[{"id":"work-1","accepted":true,"state":"publishing","publication":{"repo":"acme/widgets","branch":"refs/heads/fixer-inc-work-1","baseSha":"base-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"publicationCountBefore":0},{"id":"work-2","accepted":true,"state":"publishing","publication":{"repo":"acme/widgets","branch":"refs/heads/fixer-inc-work-2","baseSha":"base-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"publicationCountBefore":0}],"auditEvents":2,"limitTokensReferencedInsideBeginPublication":[],"sourceLines":["apps/api/src/work-items/work-item.publication.ts:22-58 (beginPublication: no project-wide PR gate)","apps/api/src/work-items/work-item.repo.ts:106-115 (publicationCount counts publications in the last hour)","apps/api/src/internal/policy-context.service.ts:31-42 (openPrsLastHour from publicationCount)","packages/policy/src/evaluation.ts:33-42 (rate_limited when openPrsLastHour >= maxOpenPrsPerHour)"]}
```

1. Run 02-pr-limit.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: Both distinct work-item/attempt pairs were admitted by the real beginPublication (both snapshots show state 'publishing' with a saved publication intent), with maxOpenPrsPerHour=1 and publicationCount reading zero at each admission. beginPublication (work-item.publication.ts:22-58) performs only per-attempt fencing (loadWork, activeAttempt, requireCommand, requireLiveLease, fenceWork, fenceAttempt) and never consults publicationCount, maxOpenPrsPerHour, openPrsLastHour, or any project-wide reservation (limit tokens found inside function: []). No project-wide PR limit blocks the second publication intent.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires two eligible Work attempts and concurrent timing.

Impact: Exceeds the owner's configured publication cap for one Project.

Smallest effective fix: Re-check and atomically reserve a Project-wide publication slot inside beginPublication using the same policy limit; add a deterministic two-attempt regression test.


## Permanent Haunting-write failures retain expanding observation histories

Severity: **low**. Fingerprint: `apps/daemon/src/observations.ts:failed-outcome-retention`.

A plugin Credential holder can send small valid detection Events with unique 180-character IDs. The public DTO and Event schema accept those IDs, but createObservations appends :detected:<rule> and sends that longer value to an internal DTO capped at 180 characters. Each write is therefore permanently refused after the accepted WatcherOutcome has entered the daemon's pending map. The consumer's five-delivery limit eventually stops retrying the broker record without notifying or evicting the cached outcome. With timestamps spaced by the watcher dedupe interval, later failed Events for the same bound service retain successive cloned histories containing one, two, three and more detections. This yields source-visible quadratic retained history across a linear number of small Events in the daemon shared by other granted Projects. No heap measurement, crash or service outage has been observed.

Root cause: The in-memory pending outcome cache has success-only cleanup and no terminal-failure, size or expiry policy. Public Event-ID validation is incompatible with derived internal idempotency-key limits, supplying a deterministic permanent-error trigger. createGrouper returns a deep clone of each cumulative group, so each abandoned pending outcome retains its own history rather than only one bounded reference.

Intended behavior: A terminally refused observation must be evicted and must not retain growing cumulative histories.

### Source trace

1. [apps/api/src/auth/dto/publish-event.dto.ts:17](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/dto/publish-event.dto.ts:17) — **entrypoint**, PublishEventDto.id: A Credential holder can choose a nonempty 180-character low-entropy alphabetic ID. The small envelope fits the API size limit and can use its bound service.
2. [apps/api/src/auth/services/event-ingest.service.ts:46](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/services/event-ingest.service.ts:46) — **propagation**, EventIngestService.ingest: Preparation and publication retain the caller's ID after Project/service authorization. An unassigned Event audit key with this ID still fits the core 200-character audit-key contract.
3. [apps/daemon/src/observations.ts:99](/Users/xirothedev/workspace/graveshift/apps/daemon/src/observations.ts:99) — **propagation**, observe outcome staging: The watcher is mutated and its accepted outcomes are saved in pending before any durable Haunting write completes.
4. [packages/watcher/src/pipeline.ts:64](/Users/xirothedev/workspace/graveshift/packages/watcher/src/pipeline.ts:64) — **propagation**, createGrouper.add: Each accepted detection extends signalIds and detections, then returns a structured clone of the entire cumulative group. Ten-minute-spaced caller timestamps permit successive accepted detections.
5. [apps/daemon/src/observations.ts:120](/Users/xirothedev/workspace/graveshift/apps/daemon/src/observations.ts:120) — **propagation**, processOutcome detection write: The daemon derives eventId by adding :detected: and the rule name to the already 180-character Event ID.
6. [apps/api/src/hauntings/dto/haunting.dto.ts:38](/Users/xirothedev/workspace/graveshift/apps/api/src/hauntings/dto/haunting.dto.ts:38) — **propagation**, RecordHauntingDto.eventId: The internal record route rejects this derived value through MaxLength(180), which the global validation pipe reports as an unprocessable request.
7. [packages/events/src/consumer.ts:114](/Users/xirothedev/workspace/graveshift/packages/events/src/consumer.ts:114) — **propagation**, processQueued error recovery: Failed observation processing requests redelivery; the declared consumer caps deliveries at five but has no terminal-outcome callback to the observation cache.
8. [apps/daemon/src/observations.ts:202](/Users/xirothedev/workspace/graveshift/apps/daemon/src/observations.ts:202) — **sink**, observe completion and pending cleanup: The rejected reduction bypasses pending.delete at line 206. Cached cloned histories remain reachable for the lifetime of the observation runtime after broker retry exhaustion.

### Evidence

- [apps/daemon/src/observations.ts:52](/Users/xirothedev/workspace/graveshift/apps/daemon/src/observations.ts:52) — The pending Map has no declared size, expiry, cancellation or terminal-delivery eviction policy. Its only deletion is after successful processing.
- [packages/core/src/schemas.ts:3](/Users/xirothedev/workspace/graveshift/packages/core/src/schemas.ts:3) — The shared ID schema imposes only nonemptiness, so envelope preparation does not reject the public 180-character input.
- [apps/api/src/app.factory.ts:27](/Users/xirothedev/workspace/graveshift/apps/api/src/app.factory.ts:27) — Global DTO validation applies the internal maximum and uses HTTP 422 for validation failures.
- [apps/daemon/src/api-client.ts:38](/Users/xirothedev/workspace/graveshift/apps/daemon/src/api-client.ts:38) — The private API client throws for the 422 response, propagating failure out of observation processing before cleanup.
- [packages/events/src/streams.ts:34](/Users/xirothedev/workspace/graveshift/packages/events/src/streams.ts:34) — Five broker deliveries and bounded broker retention do not remove objects retained in the separate observation closure.
- [apps/api/src/auth/env.schema.ts:35](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/env.schema.ts:35) — The default 65536-byte Event cap and 60-per-minute throttle bound individual input and arrival rate, but not lifetime cached outcomes. The proposed inputs are under one KiB each.
- [apps/daemon/src/main.ts:115](/Users/xirothedev/workspace/graveshift/apps/daemon/src/main.ts:115) — One observation runtime is passed to the shared granted-Project consumer, so retained state occupies the daemon used by other Projects.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"eventIdLength":180,"writeEventIdLengths":[201,201,201,201,201,201],"dtoLimit":180,"feedCount":6,"failedFeeds":6,"failureMessages":["DTO limit exceeded: eventId must be <= 180 chars"],"pendingSets":3,"pendingDeletes":0,"retainedPendingOutcomes":3,"activeCalls":3,"activeCallsOnRetries":0,"getCalls":6,"writeAttempts":6,"rejectedWrites":6,"workCalls":0,"gatewayCalls":0,"inspectionHook":"instrumented Map.prototype.set/delete keyed by the 180-char event ids"}
```

1. Run 03-failed-outcome-retention.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: Every permanently failed outcome stayed in pending: three unique ids produced three sets and zero deletes; the three retries skipped the active lookup (retained-outcome path) and re-attempted the write, so retention grows linearly with failures with no eviction.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires repeated unique long IDs from an authorized producer.

Impact: Demonstrated retained-history growth in a fixture; no measured process outage.

Smallest effective fix: Validate the derived internal eventId against the DTO limit before watcher mutation, add terminal-delivery eviction, and bound the pending map.


## A co-tenant Event can prevent release of another Project's closed Haunting group

Severity: **medium**. Fingerprint: `apps/daemon/src/observations.ts:service-cache-project-scope`.

When one daemon serves two granted Projects using the same service name, a Credential holder in Project B can submit a valid Event for that service (e.g. a warning 'http.request', a type unhandled by createRules, so no B detection is produced) while B has no active Haunting. The active lookup for B deletes the service-only byService cache entry belonging to Project A, but its attempted release is restricted to B and leaves A's watcher group intact. If A's durable Haunting is closed before its next eligible detection, that detection reuses the unreleased [A,service] group. The daemon loads A's closed record by ID, spreads prior.incident after change.incident so the closed state wins, and appends the new detection to that closed row rather than opening the fresh active Haunting expected by the existing single-Project close/reopen behavior (which the source test 'a persisted closed Haunting releases the old in-memory group for the next observation' exercises). The minimum claimed boundary result is a new Project A detection being recorded on a closed Haunting because of Project B's Event.

Root cause: createObservations stores active IDs in byService under service alone (lines 42, 50, 69, 92-97), whereas createGrouper stores open groups under [detection.projectId,detection.service] (pipeline.ts:44). Cache deletion, replacement and release therefore refer to different namespaces: B's null-active lookup deletes A's service-only cache ID while release(B,A-id) is refused by the grouper's Project equality check (pipeline.ts:79). Durable Project checks in HauntingRepo.upsert (haunting.repo.ts:28,47-57) protect row ownership and monotonic updates but do not repair the stale group, and haunting.mapper.mergeRecorded/hauntingData preserve the prior closed incident state on the appended detection.

Intended behavior: An Event from one Project must not corrupt another Project's Haunting lifecycle cache.

### Source trace

1. [apps/api/src/auth/services/event-ingest.service.ts:26](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/services/event-ingest.service.ts:26) — **entrypoint**, EventIngestService.ingest: A Project B Credential with events:publish may publish an Event whose body.projectId is B and whose body.service is a shared service name such as 'checkout' (project/service binding is checked at lines 31-35). A warning 'http.request' Event is schema-valid but unhandled by createRules, so it exercises the daemon active lookup without creating a B detection.
2. [packages/events/src/consumer.ts:91](/Users/xirothedev/workspace/graveshift/packages/events/src/consumer.ts:91) — **propagation**, processQueued granted Project intake: The daemon is booted with boot.projectIds (main.ts:71) and passes them as grantedProjectIds; processQueued admits any granted Project and serially invokes the single createObservations runtime registered at main.ts:115-155.
3. [apps/daemon/src/observations.ts:92](/Users/xirothedev/workspace/graveshift/apps/daemon/src/observations.ts:92) — **propagation**, observe active-group reconciliation: For B, the project-scoped active lookup (lines 79-83) returns null. old = byService.get('checkout') is A's incident ID; watcher.release(B,A-id) is called at line 93 and line 94 deletes byService['checkout'], losing A's cache ID while A's group survives.
4. [packages/watcher/src/pipeline.ts:77](/Users/xirothedev/workspace/graveshift/packages/watcher/src/pipeline.ts:77) — **propagation**, createGrouper.release: release compares entry.projectId with the caller's projectId (B) at line 79, so it refuses to delete A's [A,'checkout'] group. A's stale group remains open while its cache entry is gone.
5. [packages/watcher/src/pipeline.ts:43](/Users/xirothedev/workspace/graveshift/packages/watcher/src/pipeline.ts:43) — **propagation**, createGrouper.add: After A's durable Haunting is resolved, A's next eligible detection finds the still-open [A,'checkout'] group via the key at line 44, so add() at lines 64-75 does not call newId() and returns an 'updated' change carrying the old A incident ID and stale 'open' state.
6. [apps/daemon/src/observations.ts:118](/Users/xirothedev/workspace/graveshift/apps/daemon/src/observations.ts:118) — **propagation**, processOutcome recorded view construction: The get-by-ID call at lines 107-111 uses A's projectId and the reused old ID, returning A's closed row. The spread at lines 123-131 places ...change.incident before ...(prior?.incident ?? {}), so the closed prior state overrides the stale 'open' state while the new detection and updatedAt are retained.
7. [apps/api/src/hauntings/haunting.repo.ts:61](/Users/xirothedev/workspace/graveshift/apps/api/src/hauntings/haunting.repo.ts:61) — **sink**, HauntingRepo.upsert: The authoritative row lookup is scoped by (projectId=A, id=old A id) at line 47; matching service/openedAt and monotonic updatedAt checks at lines 51-57 pass, so the tx.haunting.upsert at lines 61-66 writes the closed row's state back with the appended detection. No new active Haunting is created for A's detection.

### Evidence

- [apps/daemon/src/observations.ts:42](/Users/xirothedev/workspace/graveshift/apps/daemon/src/observations.ts:42) — byService is Map<string,string> keyed by service alone; its reads/writes/deletes at lines 50, 69 and 92-97 carry no Project component.
- [packages/watcher/src/pipeline.ts:44](/Users/xirothedev/workspace/graveshift/packages/watcher/src/pipeline.ts:44) — Open groups are keyed by JSON.stringify([detection.projectId,detection.service]), so the watcher and bridge cache disagree about identity.
- [apps/api/src/hauntings/haunting.repo.ts:98](/Users/xirothedev/workspace/graveshift/apps/api/src/hauntings/haunting.repo.ts:98) — active() at lines 98-105 filters state notIn ['resolved','dismissed'] at line 100 and scopes by projectId, so A's later null response is legitimate but the missing service cache ID prevents release.
- [apps/api/src/hauntings/haunting.mapper.ts:66](/Users/xirothedev/workspace/graveshift/apps/api/src/hauntings/haunting.mapper.ts:66) — mergeRecorded takes the next incident state (lines 69-76) and hauntingData writes incident.state directly to the row (line 48); there is no closed-to-new-detection lifecycle rejection.
- [apps/daemon/src/observations.ts:84](/Users/xirothedev/workspace/graveshift/apps/daemon/src/observations.ts:84) — The checks at lines 84-91 validate the returned active service, state and detection Project, but they do not scope byService itself, which remains service-only.
- [apps/daemon/src/observations.test.ts:256](/Users/xirothedev/workspace/graveshift/apps/daemon/src/observations.test.ts:256) — The single-Project test 'a persisted closed Haunting releases the old in-memory group for the next observation' confirms the intended close/reopen baseline that the cross-Project sequence breaks.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"dummyOnly":true,"watcherApiLoaded":true,"projectA":"projA","projectB":"projB","service":"checkout","seedIncidentId":"incident-a-checkout","seedActiveFound":true,"projectBEvent":{"type":"http.request","severity":"warning","observedAt":"2026-01-01T00:05:00.000Z","activeReturned":null,"activeLookupForB":[{"path":"/internal/hauntings/active","projectId":"projB","id":null,"service":"checkout"}],"hauntingRecordsOwnedByB":[]},"resolution":{"incidentId":"incident-a-checkout","state":"resolved","activeReturned":null},"freshAEvent":{"type":"runtime.oom","observedAt":"2026-01-01T00:11:00.000Z","msAfterSeed":660000,"activeReturnedBefore":null},"writes":[{"projectId":"projA","eventId":"evt-a1:detected:runtime.oom","incidentId":"incident-a-checkout","state":"open","detectionIds":["evt-seed:runtime.oom","evt-a1:runtime.oom"]},{"projectId":"projA","eventId":"evt-a2:detected:runtime.oom","incidentId":"incident-a-checkout","state":"resolved","detectionIds":["evt-seed:runtime.oom","evt-a1:runtime.oom","evt-a2:runtime.oom"]}],"finalRecords":[{"scopeKey":"projA\u0000incident-a-checkout","incidentId":"incident-a-checkout","state":"resolved","detectionIds":["evt-seed:runtime.oom","evt-a1:runtime.oom","evt-a2:runtime.oom"]}],"workCallbacks":[{"projectId":"projA","incidentId":"incident-a-checkout"},{"projectId":"projA","incidentId":"incident-a-checkout"}],"gatewayModelCalls":0,"activeForAAfter":null,"appendedToClosedRow":true,"sameIncidentId":true,"stillClosed":true,"newActiveHaunting":false}
```

1. Run 04-service-cache.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: createObservations keys byService solely by service name. The project B warning for checkout cleared that shared entry and its release was scoped to B, so when A was resolved and a fresh A runtime.oom arrived after the dedupe window, no A-scoped release occurred: the stale watcher grouper entry reused A incident id, and write() merged the new detection into the resolved row (state stays resolved), leaving no new active Haunting.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires shared service names across granted Projects.

Impact: Causes a detection to be appended to a closed incident for another Project.

Smallest effective fix: Key the active-ID cache by [projectId, service] to match the watcher grouper, and add a two-Project close/reopen regression test.


## Collector evidence selection drops Project authorization

Severity: **medium**. Fingerprint: `apps/daemon/src/reads.ts:collector-evidence-without-project`.

A caller holding an MCP Credential for one granted Project can select any service name for tail_logs and any daemon-allowlisted metric job. The API supplies the authenticated Project (the bearer guard enters it into McpProjectContext, and HttpMcpBackend.read includes it in the private daemon request) and the daemon checks grant membership, but the final collector reads no longer receive that Project: createReadHandler dispatches logs and metric without projectId, ReadRuntime declares logs(service,lines) and metric(promql) with no Project parameter, services(projectId) returns the entire global collector inventory with only an incident-state overlay, CollectorReads has no Project ownership contract, and the metric allowlist is derived from every configured job. In a deployment where one daemon observes evidence reserved for another Project or Organization, the source path would return that evidence using the daemon's Docker, Kubernetes or Prometheus authority. Redaction removes recognized sensitive strings but leaves ordinary private operational log text and numeric metrics visible. This requires a valid narrow-scope MCP Credential, a reachable real Project context, and a collector resource outside that Project's authorized scope; the cross-Project read was observed with a dummy sentinel inside the compliant container. The Event-driven diagnosis path reaches the same host-wide log reader: observations supplies an Event Project to its logs callback, but the production main callback accepts only (service, lines) and drops the Project before ReadRuntime.logs. Ordinary private log text can therefore enter the wrong Project's model context under the same ownership conditions, independently of an MCP HTTP context handoff. No provider request or persisted diagnosis was observed. Source review found no ownership predicate on any collector read path; the grant check, strict command schema, unique service match, namespace filter, exact PromQL allowlist and redaction constrain selection or content but do not bind the selected resource to the authenticated Project.

Root cause: ReadRuntime treats collector evidence as host-wide after checking only whether the caller's Project appears in the daemon grant. Its logs and metric methods have no projectId parameter, inventory is not filtered by Project, CollectorReads has no Project ownership contract, and the configured metric allowlist is global. The service uniqueness check and namespace/job allowlists constrain selection but do not bind the selected resource to the authenticated Project.

Intended behavior: Collector inventory, logs, and metrics must be authorized for the requesting Project.

### Source trace

1. [apps/api/src/mcp/mcp-token.verifier.ts:48](/Users/xirothedev/workspace/graveshift/apps/api/src/mcp/mcp-token.verifier.ts:48) — **entrypoint**, McpBearerGuard.canActivate: The external MCP caller presents a Credential; verification supplies its stored scopes and Project and attempts to bind that Project for the request via McpProjectContext.enter.
2. [apps/api/src/mcp/mcp.permissions.ts:21](/Users/xirothedev/workspace/graveshift/apps/api/src/mcp/mcp.permissions.ts:21) — **propagation**, PRIMITIVES: tail_logs requires logs:read (line 21) and query_metric requires metrics:read (line 22), without adding resource ownership restrictions.
3. [apps/api/src/mcp/mcp.tools.ts:234](/Users/xirothedev/workspace/graveshift/apps/api/src/mcp/mcp.tools.ts:234) — **propagation**, McpTools.tailLogs: The accepted service selector and bounded line count (max 200) are passed to the backend.
4. [apps/api/src/mcp/mcp.backend.ts:52](/Users/xirothedev/workspace/graveshift/apps/api/src/mcp/mcp.backend.ts:52) — **propagation**, HttpMcpBackend.read: The API requires the authenticated Project and includes it with the selector in a POST to the private daemon read endpoint.
5. [apps/daemon/src/read-handler.ts:72](/Users/xirothedev/workspace/graveshift/apps/daemon/src/read-handler.ts:72) — **propagation**, createReadHandler: The daemon bearer, strict command schema and granted Project are checked; lines 89-93 then dispatch logs and metric without projectId.
6. [apps/daemon/src/reads.ts:104](/Users/xirothedev/workspace/graveshift/apps/daemon/src/reads.ts:104) — **propagation**, createReadRuntime.logs: The runtime finds the requested service in global collector inventory, requires one matching source and invokes tailLogs without an ownership query.
7. [packages/sources-docker/src/source.ts:39](/Users/xirothedev/workspace/graveshift/packages/sources-docker/src/source.ts:39) — **propagation**, createDockerCollector.containerOf: The Docker variant searches all API-visible containers only by serviceName; no Project value is available to filter the target.
8. [packages/sources-docker/src/api.ts:94](/Users/xirothedev/workspace/graveshift/packages/sources-docker/src/api.ts:94) — **propagation**, DockerApi.logs: The selected container id is safely URL-encoded and its logs are read using the daemon's configured Docker endpoint authority.
9. [apps/api/src/mcp/mcp.tools.ts:236](/Users/xirothedev/workspace/graveshift/apps/api/src/mcp/mcp.tools.ts:236) — **sink**, McpTools.tailLogs response: Returned log text is redacted and wrapped in untrusted_logs tags, then disclosed to the original MCP caller without checking the selected service's Project.

### Evidence

- [docs/adr/0023-organization-is-the-tenant-root.md:6](/Users/xirothedev/workspace/graveshift/docs/adr/0023-organization-is-the-tenant-root.md:6) — The current product serves multiple Organizations in one deployment and derives scope from the authenticated request.
- [apps/daemon/src/main.ts:50](/Users/xirothedev/workspace/graveshift/apps/daemon/src/main.ts:50) — Collectors are bootstrapped with the first granted Project; lines 85-90 construct one shared read runtime from their sources and metric jobs, and lines 129-134 expose it to every granted Project.
- [apps/daemon/src/read-handler.ts:72](/Users/xirothedev/workspace/graveshift/apps/daemon/src/read-handler.ts:72) — The strongest Project gate is membership in options.projectIds. Lines 89-93 discard that Project for log and metric dispatch.
- [apps/daemon/src/reads.ts:77](/Users/xirothedev/workspace/graveshift/apps/daemon/src/reads.ts:77) — services(projectId) returns every inventory item and overlays only Project-specific incident state; logs selects global inventory and metric checks a global job-derived allowlist.
- [packages/integrations/src/reads.ts:15](/Users/xirothedev/workspace/graveshift/packages/integrations/src/reads.ts:15) — CollectorReads exposes inventory and log reads without any Project argument or ownership field.
- [packages/sources-docker/src/source.ts:139](/Users/xirothedev/workspace/graveshift/packages/sources-docker/src/source.ts:139) — Docker inventory includes all API-visible containers and log selection resolves only the service name.
- [packages/sources-k8s/src/source.ts:40](/Users/xirothedev/workspace/graveshift/packages/sources-k8s/src/source.ts:40) — Kubernetes filters a daemon-wide namespace list. Lines 171-185 enumerate those deployments and read a selected pod's logs without a requesting Project.
- [apps/daemon/src/collectors.ts:99](/Users/xirothedev/workspace/graveshift/apps/daemon/src/collectors.ts:99) — metricJobs contains all configured metric-target jobs, with no Project association.
- [apps/daemon/src/reads.ts:113](/Users/xirothedev/workspace/graveshift/apps/daemon/src/reads.ts:113) — The metric variant admits exact WATCHER_QUERIES for any configured job and invokes the shared metrics client. Exact query equality prevents arbitrary PromQL but does not provide tenant isolation.
- [apps/api/test/mcp-http.e2e.test.ts:52](/Users/xirothedev/workspace/graveshift/apps/api/test/mcp-http.e2e.test.ts:52) — The existing HTTP source test replaces MCP_BACKEND with a fake, so its success assertions do not establish the real bearer-to-backend Project-context handoff.
- [apps/api/src/mcp/mcp-daemon-read.fixture.ts:130](/Users/xirothedev/workspace/graveshift/apps/api/src/mcp/mcp-daemon-read.fixture.ts:130) — The adapter fixture substitutes McpProjectContext with a fixed Project, leaving production async-context propagation untested by that fixture.
- [apps/daemon/src/observations.ts:141](/Users/xirothedev/workspace/graveshift/apps/daemon/src/observations.ts:141) — The diagnosis path supplies service, 300 lines and the Event Project to its logs callback, then uses the returned logs in the Project-scoped diagnosis.
- [apps/daemon/src/main.ts:121](/Users/xirothedev/workspace/graveshift/apps/daemon/src/main.ts:121) — The production observation logs callback accepts only service and lines and calls the same Projectless ReadRuntime.logs method, dropping the Event Project.
- [packages/diagnoser/src/context.ts:36](/Users/xirothedev/workspace/graveshift/packages/diagnoser/src/context.ts:36) — Fetched logs become prepared diagnosis evidence; redaction and quotation validation do not add an ownership predicate.
- [packages/gateway/src/gateway.ts:96](/Users/xirothedev/workspace/graveshift/packages/gateway/src/gateway.ts:96) — The model adapter receives the prepared log context for the active diagnosis, establishing a source-visible alternate output path from the same wrongly scoped reader.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"dummyOnly":true,"projectA":"projA","projectB":"projB","reservedService":"reserved-service","sentinel":"SENTINEL_PROJECT_A_EVIDENCE_OK","logsCall":{"service":"reserved-service","lines":1,"projectArgument":"none"},"logLines":["SENTINEL_PROJECT_A_EVIDENCE_OK"],"sentinelReturned":true,"tailCalls":[{"service":"reserved-service","lines":1}],"listCalls":["listServices","listServices","listServices"],"servicesForProjectB":[{"name":"reserved-service","status":"healthy"}],"servicesForProjectA":[{"name":"reserved-service","status":"healthy"}],"reservedInventoryVisibleToB":true,"reservedInventoryVisibleToA":true,"apiCalls":[{"path":"/internal/hauntings/list","body":{"projectId":"projB"}},{"path":"/internal/hauntings/list","body":{"projectId":"projA"}}]}
```

1. Run 05-collector-evidence.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: createReadRuntime exposes logs(service, lines) with no Project parameter; the Collector inventory is host-wide. A source reserved for Project A was reached by a project-less logs() call (sentinel returned), and the same reserved inventory appeared in services(projectB) as well as services(projectA). Project A evidence is reachable without a Project binding.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires a shared daemon and a service name matching another Project's workload.

Impact: Returns or forwards another Project's private evidence.

Smallest effective fix: Thread projectId through ReadRuntime and CollectorReads, enforce a Project-to-resource ownership predicate, and add a two-Project sentinel test.


## Fix repository selection is not bound to the Work Project

Severity: **medium**. Fingerprint: `daemon/fix-context/service-only-repository-selection`.

A tenant able to publish evidence and initiate an eligible Fix in its own granted Project can name a service mapped by the instance policy to a repository outside that tenant's authority. contextClient checks the tenant's durable diagnosis and Deployment, but chooses the repository solely by service name. If the attacker registers a known commit from that repository as a Deployment in its own Project and the normal Fix policy allows the attempt, the daemon uses its operator GitHub App identity to fetch that repository for the attacker's Fix task. The affected resource is the other principal's repository/source context; the attacker need not possess a GitHub credential or membership in its owning Project. This candidate stops at the unauthorized repository-read/context-selection boundary and does not claim a verified patch, draft PR, merge or code execution. Independent source review of the same trace confirms: repository resolution uses only snapshot.item.service (fix-context.ts:42-46) while caller.projectId appears only in later durable reads/detections (lines 48, 64); RepoPolicy has no Project selector (types.ts:3-9; schema.ts:44-58); the final publication check repeats only service membership (open-pr.ts:36); and a caller-supplied Deployment SHA in its own Project (deploys.service.ts:30-56; DTO line 47 only checks 40-hex) supplies a syntactically valid commit point. Boot config is a single instance-wide PolicySchema with one github.repos mapping and one grant Project set (boot-config.ts:9-18; main.ts:94-99; internal-config.controller.ts:19-23); GitHub installation selection is keyed by repo string (auth.ts:95-97), not Project. The committed example config calibrates that this global service-to-repo mapping is the intended structural pattern, but that calibration is not grounds to dismiss the missing Project-to-repository authorization.

Root cause: Project scope is preserved for Work, diagnosis, detections and Deployment records but is dropped at repository selection. The shared policy's repository records and service-based rules contain no Project grant, and neither contextClient nor prepareSource checks a caller-Project-to-repository authorization before using the instance GitHub identity.

Intended behavior: A Fix must select only a repository authorized for the authenticated Project.

### Source trace

1. [apps/api/src/deploys/deploys.service.ts:30](/Users/xirothedev/workspace/graveshift/apps/api/src/deploys/deploys.service.ts:30) — **entrypoint**, DeploysService.create: With its own Deployment-write authority, the tenant registers a supplied 40-hex SHA in its own Project. The service checks Organization and Project access (lines 35-41), then appends the supplied SHA without repository ownership/provenance binding (lines 47-56). This is a required prerequisite, not a Deployment-authentication bypass.
2. [apps/api/src/auth/services/event-ingest.service.ts:26](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/services/event-ingest.service.ts:26) — **propagation**, EventIngestService.ingest: The plugin producer supplies service, its own projectId and the registered Deployment. Scope, Project equality (line 31), optional Credential service equality (lines 33-35) and same-Project Deployment lookup (line 45) are enforced; the service is not resolved to a Project-owned repository.
3. [apps/daemon/src/observations.ts:181](/Users/xirothedev/workspace/graveshift/apps/daemon/src/observations.ts:181) — **propagation**, createObservations.processOutcome: The Event's diagnosed incident is saved in its Project (lines 181-189), converted to a Work item with that projectId (lines 191-199) and passed to onWork with that Project. A later eligible Fix remains a command on the attacker's own Work item.
4. [apps/daemon/src/work-flow.ts:74](/Users/xirothedev/workspace/graveshift/apps/daemon/src/work-flow.ts:74) — **propagation**, createWorkCommands.fixNow: The command checks the daemon Project grant (verify, lines 35-39), reads that Project's Work item (line 79), checks Fix eligibility (line 80) and claims an attempt (lines 81-84). The autoFix triage sibling reaches the same runFix path (lines 62-72).
5. [apps/daemon/src/fix-context.ts:42](/Users/xirothedev/workspace/graveshift/apps/daemon/src/fix-context.ts:42) — **propagation**, contextClient repository resolution: The repository filter compares only repo.services with snapshot.item.service (lines 42-44). The unique match is selected (lines 45-46) before the subsequent caller-Project-bound context checks.
6. [apps/daemon/src/fix-context.ts:55](/Users/xirothedev/workspace/graveshift/apps/daemon/src/fix-context.ts:55) — **propagation**, contextClient context binding: Strong diagnosis, service, confidence, category, detection-Project, signal and Deployment-SHA consistency checks bind the durable context (lines 55-72), but the returned repo is never checked against caller.projectId.
7. [apps/daemon/src/run-fix.ts:96](/Users/xirothedev/workspace/graveshift/apps/daemon/src/run-fix.ts:96) — **propagation**, runOwnedFix policy decision: The open_pr decision and its audit must permit the attempt (lines 96-109). Its category/service/signal/counter gates (evaluation.ts:8-44) cannot supply the missing Project-to-repository grant.
8. [apps/daemon/src/fix-execution.ts:111](/Users/xirothedev/workspace/graveshift/apps/daemon/src/fix-execution.ts:111) — **propagation**, prepareFix source preparation: After audit-scope, Deployment-SHA, base-audit (lines 80-105) and configured-verification checks (lines 108-110), the daemon passes input.context.repo, its GitHub client and the Project's Deployment SHA to prepareSource.
9. [apps/daemon/src/run-fix.ts:90](/Users/xirothedev/workspace/graveshift/apps/daemon/src/run-fix.ts:90) — **propagation**, runOwnedFix: The claimed attempt resolves context with the authenticated caller and its Project-scoped Work snapshot (line 90).
10. [apps/daemon/src/publication.ts:50](/Users/xirothedev/workspace/graveshift/apps/daemon/src/publication.ts:50) — **propagation**, publishFix: Publication admission persists the chosen repo/branch/base under the caller's Project via beginPublication (lines 50-52) before invoking the prepared publication (line 55); it does not add a repository ownership check.
11. [packages/fixer/src/open-pr.ts:36](/Users/xirothedev/workspace/graveshift/packages/fixer/src/open-pr.ts:36) — **propagation**, publicationText: The last repository allowlist gate checks incident.service against repo.services and the patch path rules, with no Project selector.
12. [packages/fixer/src/source.ts:190](/Users/xirothedev/workspace/graveshift/packages/fixer/src/source.ts:190) — **sink**, prepareSource GitHub read: client.getCommitTree(repo.repo, baseSha), followed by tree/blob reads (lines 191, 204), uses the instance GitHub identity without caller Project information. This is the minimum resource-authority boundary requiring validation.

### Evidence

- [apps/api/src/internal/internal-config.controller.ts:19](/Users/xirothedev/workspace/graveshift/apps/api/src/internal/internal-config.controller.ts:19) — One daemon grant supplies a Project set (line 21) alongside a single instance policy and Agent list (lines 22-23), rather than a policy/repository mapping for each Project.
- [packages/policy/src/schema.ts:44](/Users/xirothedev/workspace/graveshift/packages/policy/src/schema.ts:44) — Repository entries contain repo, services, base branch and patch constraints (lines 45-57), but no Project owner/grant. Rule matching (lines 10-26) also lacks a Project selector.
- [apps/daemon/src/fix-context.ts:42](/Users/xirothedev/workspace/graveshift/apps/daemon/src/fix-context.ts:42) — Repository selection is the unique service-name match; caller.projectId is used only in later durable API reads (line 48) and detection checks (line 64).
- [apps/api/src/deploys/deploys.controller.ts:63](/Users/xirothedev/workspace/graveshift/apps/api/src/deploys/deploys.controller.ts:63) — Deployment creation requires the tenant's legitimate org:ci or project:write authority (line 64). The candidate does not assume another Project's Deployment can be borrowed.
- [apps/api/src/deploys/dto/create-deploy.dto.ts:44](/Users/xirothedev/workspace/graveshift/apps/api/src/deploys/dto/create-deploy.dto.ts:44) — Deployment input validates the 40-hex SHA format (lines 45-48) and metadata, while DeploysService.create checks the caller's own Project and stores the supplied SHA without repository verification.
- [packages/policy/src/evaluation.ts:8](/Users/xirothedev/workspace/graveshift/packages/policy/src/evaluation.ts:8) — Policy matching uses action, category, service and signals; confidence, counters and spend gates (lines 23-44) remain effective, but do not authorize the selected repository for a Project.
- [apps/daemon/src/fix-execution.ts:107](/Users/xirothedev/workspace/graveshift/apps/daemon/src/fix-execution.ts:107) — The last controls before source retrieval require a configured verification entry (lines 108-110) and audited base SHA (lines 83-105). They do not inspect repository ownership, and the downstream source API accepts no caller Project.
- [apps/daemon/src/main.ts:94](/Users/xirothedev/workspace/graveshift/apps/daemon/src/main.ts:94) — One command runtime receives all boot.projectIds (line 95) and one shared boot.policy/contextClient (lines 97, 99).
- [apps/api/src/auth/services/credential.service.ts:81](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/services/credential.service.ts:81) — A delegated Credential binds the caller's Project and stores the requested service value (line 83); it does not reserve that service name across Projects.
- [apps/api/src/auth/services/event-ingest.service.ts:30](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/services/event-ingest.service.ts:30) — Event guards enforce the credential's own Project/service (lines 30-35) and an own-Project Deployment lookup (line 45). They do not establish ownership of a GitHub repository named by a matching global service policy.
- [apps/api/src/deploys/deploys.service.ts:35](/Users/xirothedev/workspace/graveshift/apps/api/src/deploys/deploys.service.ts:35) — Deployment creation correctly checks own-Organization/Project authority (lines 35-41), then stores the caller-supplied SHA without associating it with a repository (lines 47-56). The DTO checks a 40-hex form.
- [packages/fixer/src/open-pr.ts:36](/Users/xirothedev/workspace/graveshift/packages/fixer/src/open-pr.ts:36) — The final publication target check is service membership only; the GitHub installation is selected later from the resulting repository string (auth.ts:95-97).

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"dummyOnly":true,"sourceCitation":"apps/daemon/src/fix-context.ts:42-46","exportedSelectorFound":false,"projects":{"projectA":"projA","projectB":"projB"},"snapshotService":"checkout","policyRepoServices":["checkout"],"reproducedSelectionForCallerB":"dummy-org/checkout-service","realContextClientCallerB":{"callerProjectId":"projB","selectedRepo":"dummy-org/checkout-service","category":"resource_exhaustion","deploymentIdPrefix":"aaaaaaaa"},"realContextClientCallerA":{"callerProjectId":"projA","selectedRepo":"dummy-org/checkout-service"},"apiRefs":[{"projectId":"projB","service":"checkout"},{"projectId":"projB","service":"checkout"},{"projectId":"projA","service":"checkout"},{"projectId":"projA","service":"checkout"}],"apiRefsUseCallerProject":true}
```

1. Run 06-fix-context-repo.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: contextClient selects the repository solely with policy.github.repos.filter(repo => repo.services.includes(snapshot.item.service)) at lines 42-46; caller.projectId is used only in the later internal API reference, never in selection. With caller.projectId=projB and a snapshot whose service maps to the sole repo, the real contextClient still returned that repo, and caller.projectId=projA returned the identical repo.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires mutually untrusted Projects and a shared service-to-repository mapping.

Impact: Uses instance GitHub authority to read and draft in another Project's repository.

Smallest effective fix: Add a Project grant to repository policy and reject repository selection when caller.projectId is not authorized before any GitHub read.


## Combined Compose service identity can carry platform authority into the demo image

Severity: **medium**. Fingerprint: `deploy/compose/api-service-overlay-retains-control-plane-authority`.

Source review confirms the documented combined launch (docs/DEMO.md:20) lists deploy/compose/graveshift.compose.yml before deploy/compose/demo.compose.yml, and both files declare services.api under the same project name graveshift. Under standard Compose multi-file merge semantics (confirmed here by a parent-side config render of scratch copies), the later demo definition sets image, build.context and x-app environment/networks but does not use !reset or !override (no such directives exist in deploy/compose/), so the platform api definition's environment keys (internal tokens, OAuth JWT secret, root-bootstrap fields at graveshift.compose.yml:94-100), build.dockerfile, command, profiles and core network are not cleared by source. A concrete lower-trust principal exists: .kiro/agents/chaos-witch.json:9 denies shell and denies fs_write except under examples/**, so it can alter the example build context, Dockerfile and launcher but not deploy/platform source. The finding does NOT assert that the unchanged combination leaks real secrets: the retained platform command src/main.ts and build.dockerfile deploy/compose/bun.Dockerfile are absent from the example context (verified: no examples/haunted-candy-shop/src/main.ts and no examples/haunted-candy-shop/deploy/), and the retained api profile is not enabled by the documented command. A trusted parent-side `docker compose config --format json` render of scratch copies with a dummy marker confirmed that, with the api profile enabled, the merged api service selects the examples-controlled image while retaining the platform credential environment keys and the core network; no image build or process execution was performed, and delivery of real credentials remains owner/conditional.

Root cause: deploy/compose/graveshift.compose.yml and deploy/compose/demo.compose.yml assign different trust roles to the same Compose service key api. The later demo definition overrides image and build.context but, in source, contains no environment/network/profile/command/build.dockerfile reset directives, so under standard Compose merge the platform API's credential environment, core network, api profile, src/main.ts command and deploy/compose/bun.Dockerfile path can be retained. An actor with write authority confined to examples/** can then control the selected image's build and runtime inputs without editing platform configuration. The source-visible prerequisites (api profile co-enablement, nonempty owner credentials, and a runnable examples-supplied variant supplying the absent Dockerfile/entrypoint) are not established as met.

Intended behavior: A lower-trust example image must not inherit platform credentials or networking.

### Source trace

1. [.kiro/agents/chaos-witch.json:9](/Users/xirothedev/workspace/graveshift/.kiro/agents/chaos-witch.json:9) — **entrypoint**, Declared examples-only write capability: Line 9 denies shell and denies fs_write on ** with exclude examples/**; the agent prompt at line 12 restates 'Write only under examples/' and 'Never touch source packages.' This is a concrete lower-trust source-editing role for the example Dockerfile and launcher; the candidate also covers any equivalently scoped example contributor.
2. [examples/haunted-candy-shop/Dockerfile:5](/Users/xirothedev/workspace/graveshift/examples/haunted-candy-shop/Dockerfile:5) — **propagation**, Example-controlled image inputs: Line 5 copies src into the image; line 8 sets CMD bun src/api-main.ts. An examples-only writer controls the code packaged into this lower-trust image and can add examples-local files (e.g. src/main.ts and a compatible deploy/compose/bun.Dockerfile under the example context) matching fields retained by the merged service, with no platform-source edit.
3. [deploy/compose/graveshift.compose.yml:78](/Users/xirothedev/workspace/graveshift/deploy/compose/graveshift.compose.yml:78) — **propagation**, Privileged API service definition: services.api (line 78) is opt-in via profiles: [api] (line 82), builds from deploy/compose/bun.Dockerfile (line 85), runs bun src/main.ts (line 88), holds internal-token/JWT/root-bootstrap environment fields (lines 94-100, all ${VAR:-} defaults) and joins core (line 105). Empty defaults and the profile gate are material prerequisites, not an observed grant.
4. [docs/DEMO.md:20](/Users/xirothedev/workspace/graveshift/docs/DEMO.md:20) — **propagation**, Maintained combined file order: Line 20 documents 'docker compose -f deploy/compose/graveshift.compose.yml -f deploy/compose/demo.compose.yml up -d --build', selecting support first and demo second so same-named service definitions merge; line 81 repeats the order for down. The command does not pass --profile api, so the inherited API profile must be enabled separately for the colliding service to run.
5. [deploy/compose/demo.compose.yml:23](/Users/xirothedev/workspace/graveshift/deploy/compose/demo.compose.yml:23) — **sink**, Merged api workload identity and environment: services.api (line 23) merges <<: *app (line 24): example build context and haunted-candy-shop:local image (lines 7-9), candy network (line 15), demo environment map (lines 16-20). No reset directives clear the platform fields from the earlier file. The claimed minimum boundary result is a runnable lower-trust image receiving a dummy platform-secret marker; retained core membership is a second configuration effect, without assuming any successful management operation.

### Evidence

- [.kiro/agents/chaos-witch.json:9](/Users/xirothedev/workspace/graveshift/.kiro/agents/chaos-witch.json:9) — fs_write deny on ** with exclude examples/** and shell deny on line 8 supply the limited example-editing role rather than assuming deploy-file write access; line 12 prompt reinforces the scope.
- [deploy/compose/graveshift.compose.yml:82](/Users/xirothedev/workspace/graveshift/deploy/compose/graveshift.compose.yml:82) — The platform API retains profiles: [api]; a combined run without this profile does not establish execution of the colliding API service, and the documented command at DEMO.md:20 omits it.
- [deploy/compose/graveshift.compose.yml:85](/Users/xirothedev/workspace/graveshift/deploy/compose/graveshift.compose.yml:85) — build.dockerfile is deploy/compose/bun.Dockerfile, which a context-only override retains under the example build context. Verified absent from the current example tree, so the unchanged combination is not established buildable.
- [deploy/compose/graveshift.compose.yml:88](/Users/xirothedev/workspace/graveshift/deploy/compose/graveshift.compose.yml:88) — command invokes bun src/main.ts. The example provides api-main.ts and worker-main.ts but no src/main.ts, so an unchanged runnable leak is not established.
- [deploy/compose/graveshift.compose.yml:94](/Users/xirothedev/workspace/graveshift/deploy/compose/graveshift.compose.yml:94) — API environment contains GRAVESHIFT_API_INTERNAL_TOKEN, plus GRAVESHIFT_DAEMON_INTERNAL_TOKEN (95), GRAVESHIFT_OAUTH_JWT_SECRET (96) and root-bootstrap fields (97-100), all sourced from the owner environment with empty defaults. No real values were read or copied.
- [deploy/compose/graveshift.compose.yml:105](/Users/xirothedev/workspace/graveshift/deploy/compose/graveshift.compose.yml:105) — The platform API joins core, the network shared by the read proxy, broker, database, actuator and Prometheus. The demo override does not explicitly reset this network list.
- [deploy/compose/demo.compose.yml:7](/Users/xirothedev/workspace/graveshift/deploy/compose/demo.compose.yml:7) — x-app sets build.context to ../../examples/haunted-candy-shop (line 8), image haunted-candy-shop:local (line 9), networks [candy] (line 15) and a demo environment map (lines 16-20).
- [deploy/compose/demo.compose.yml:23](/Users/xirothedev/workspace/graveshift/deploy/compose/demo.compose.yml:23) — The demo uses the identical api service key with <<: *app and no environment/network/profile/command reset or !reset/!override tag (verified none in deploy/compose), supplying the source-visible conflicting handoff.
- [examples/haunted-candy-shop/src/api-main.ts:3](/Users/xirothedev/workspace/graveshift/examples/haunted-candy-shop/src/api-main.ts:3) — The normal example launcher consumes process.env via createApi({ env: process.env }); an examples-controlled compatible launcher likewise reads the environment delivered to its container. Actual delivery of a dummy privileged marker remains untested.
- [docs/DEMO.md:20](/Users/xirothedev/workspace/graveshift/docs/DEMO.md:20) — The combined support-first, demo-second invocation is maintained documentation (also line 81). Its default profile omission and inherited build/command failures must be accounted for when evaluating applicability.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"method":"Trusted parent-side `docker compose config --format json` on a scratch copy of the two maintained manifests, with the api profile enabled and an 11-key dummy environment.","unchanged_pair_validation":"Compose v5.5.0 rejects the unmodified pair: services.api.security_opt contains duplicate no-new-privileges:true entries from the two YAML merges.","scratch_fixture_change":"The demo copy replaced its security_opt line with `security_opt: !reset [no-new-privileges:true]` so the merge could render; no platform source was edited.","rendered_api":{"image":"haunted-candy-shop:local","build_context_absolute":"/Users/xirothedev/security-audit-skill/graveshift/run-1/examples/haunted-candy-shop","build_dockerfile":"deploy/compose/bun.Dockerfile","command":["bun","src/main.ts"],"profiles":["api"],"networks":["candy","core"]},"platform_credential_environment_keys_present":["GRAVESHIFT_API_INTERNAL_TOKEN","GRAVESHIFT_DAEMON_INTERNAL_TOKEN","GRAVESHIFT_OAUTH_JWT_SECRET","GRAVESHIFT_ROOT_ADMIN_EMAIL","GRAVESHIFT_ROOT_ADMIN_PASSWORD","GRAVESHIFT_ROOT_ORG_NAME","GRAVESHIFT_ROOT_ORG_SLUG"],"dummy_marker_delivered":true,"marker_value_note":"A dummy 32-character marker was used; no real secret was read or copied."}
```

1. Parent-side only: copy deploy/compose/graveshift.compose.yml and deploy/compose/demo.compose.yml to scratch; in the demo copy set `security_opt: !reset [no-new-privileges:true]` (the unchanged pair fails Compose v5 with duplicate no-new-privileges:true); run `docker compose --profile api -f <support copy> -f <demo copy> config --format json` with an 11-key dummy environment. The rendered api service is the single structured observed result; no container harness was used and no target source was edited.

Observed result: When the api profile is enabled, the merged services.api selects the examples-controlled image while retaining the platform credential environment fields and the core network. The unchanged pair fails Compose v5 validation because of a duplicate security_opt item; resolving that in a scratch copy produced the rendered result.

### Conditions, priority and source fix

- system_configuration: The observation was a trusted parent-side `docker compose config --format json` render of bounded dummy-data scratch copies of the two maintained manifests; no container was run, and deployment preconditions are recorded in the source trace.

Likelihood: Requires the documented combined launch with the api profile and nonempty credentials.

Impact: Delivers platform credentials and core-network membership to the example workload.

Smallest effective fix: Use distinct Compose service keys and explicit !reset directives for environment and networks, or separate Compose projects, and validate the combined render in CI.


## Publication recovery can accept a same-parent head with unverified content

Severity: **medium**. Fingerprint: `fixer/recovery/parent-only-publication-binding`.

A repository actor able to rewrite a generated bot branch can replace its head with a different tree whose sole parent is the admitted Deployment SHA. If the draft is still open and the attempt needs reconciliation, recovery checks the current PR head against the current ref and original parent, then records that draft as the completed Fix. It never compares the remote tree to the verified patch. The branch name includes verified hashes, but a writer can retain that name while changing its content. The affected boundary is Graveshift's verification/result authority: the claimed effect is acceptance of an unverified draft head, not GitHub write privilege gain for a writer, automatic merge, or release execution. Branch permissions and a bounded acceptance result remain unvalidated.

Root cause: The immutable object identity is lost when planPublication reduces the receipt to repo/branch/baseSha and PublicationIntent persists only those fields. getExistingDraft binds the current head/ref to the base parent but does not bind its tree or head digest to the original verified result. Both existing-draft reuse and uncertain-effect reconciliation trust this weaker identity.

Intended behavior: Draft recovery must verify the same immutable content identity that was originally verified.

### Source trace

1. [apps/daemon/src/recovery.ts:43](/Users/xirothedev/workspace/graveshift/apps/daemon/src/recovery.ts:43) — **entrypoint**, reconcile: An authenticated replay of an uncertain publication parses the persisted intent containing repo, branch and baseSha, with no expected result tree or head. The lower-trust input is the current remote branch/PR state a repository writer can have replaced.
2. [packages/fixer/src/verified-publication.ts:34](/Users/xirothedev/workspace/graveshift/packages/fixer/src/verified-publication.ts:34) — **propagation**, recoverPublication: Recovery forwards only the recorded repository, mutable branch name and base SHA to the GitHub client and checks the returned repository/branch.
3. [packages/fixer/src/rest.ts:140](/Users/xirothedev/workspace/graveshift/packages/fixer/src/rest.ts:140) — **propagation**, getExistingDraft: The client requires a unique open draft with the exact head ref in the same repository, preventing fork/ref confusion but not modification of the named branch.
4. [packages/fixer/src/rest.ts:156](/Users/xirothedev/workspace/graveshift/packages/fixer/src/rest.ts:156) — **propagation**, getExistingDraft head validation: It reads the remote commit's SHA and parents plus the current ref. The schema omits tree identity; acceptance requires only matching current head/ref and one parent equal to the recorded base. A different tree with that parent satisfies these checks.
5. [apps/daemon/src/recovery.ts:60](/Users/xirothedev/workspace/graveshift/apps/daemon/src/recovery.ts:60) — **propagation**, reconcile recordPublication: The returned head reference is recorded under the original attempt and base. API recordPublication checks intent repository/branch/base and known-reference equality, not the verified tree.
6. [apps/daemon/src/recovery.ts:64](/Users/xirothedev/workspace/graveshift/apps/daemon/src/recovery.ts:64) — **sink**, reconcile completion: The Work attempt is finished as completed with ok:true and the recovered head, without rerunning source verification. The minimal result to validate is recording a harmless substituted tree as the verified Fix.

### Evidence

- [packages/fixer/src/verified-publication.ts:19](/Users/xirothedev/workspace/graveshift/packages/fixer/src/verified-publication.ts:19) — planPublication validates the local receipt but returns only repository, deterministic branch and original base SHA.
- [packages/fixer/src/open-pr.ts:41](/Users/xirothedev/workspace/graveshift/packages/fixer/src/open-pr.ts:41) — Snapshot and patch hashes influence the branch name; they are not independently recovered from remote content.
- [packages/work/src/state.ts:19](/Users/xirothedev/workspace/graveshift/packages/work/src/state.ts:19) — The durable PublicationIntent schema has no expected head, expected tree or verified content digest.
- [packages/fixer/src/rest.ts:168](/Users/xirothedev/workspace/graveshift/packages/fixer/src/rest.ts:168) — The strongest remote check verifies PR head/ref consistency and a single parent equal to baseSha, with no content-identity comparison.
- [packages/fixer/src/verified-publication.ts:62](/Users/xirothedev/workspace/graveshift/packages/fixer/src/verified-publication.ts:62) — The normal publication path also returns a recovered existing draft immediately, without creating the verified content again or checking its remote tree.
- [apps/api/src/work-items/work-item.publication.ts:71](/Users/xirothedev/workspace/graveshift/apps/api/src/work-items/work-item.publication.ts:71) — The durable consumer checks repository/branch/base equality and fences state, but accepts the first recovered head because the intent has no expected content identity.
- [packages/fixer/src/source-rest.test.ts:152](/Users/xirothedev/workspace/graveshift/packages/fixer/src/source-rest.test.ts:152) — Source tests exercise wrong base, merge/root commits, moved refs and mismatched heads; no same-parent/different-tree binding is represented. These tests were not executed.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"plan":{"repo":"acme/widgets","branch":"refs/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue","baseSha":"base-1111111111111111111111111111111111111111"},"planKeys":["baseSha","branch","repo"],"planCarriesExpectedTree":false,"baseSha":"base-1111111111111111111111111111111111111111","verifiedTree":"tree-verified-2222222222222222222222222222222222222222","substitutedTree":"tree-substituted-33333333333333333333333333333333333333","treesDiffer":true,"bothCommitsShareSingleParent":true,"draftHeadSha":"commit-substituted-55555555555555555555555555555555555555","returnedByGetExistingDraft":{"repo":"acme/widgets","branch":"refs/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue","number":7,"url":"https://github.com/acme/widgets/pull/7","headSha":"commit-substituted-55555555555555555555555555555555555555"},"returnedByRecoverPublication":{"repo":"acme/widgets","branch":"refs/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue","number":7,"url":"https://github.com/acme/widgets/pull/7","headSha":"commit-substituted-55555555555555555555555555555555555555"},"headShaAccepted":true,"transportCalls":["GET /repos/acme/widgets/git/commits/commit-verified-4444444444444444444444444444444444444444","GET /repos/acme/widgets/git/commits/commit-substituted-55555555555555555555555555555555555555","GET /repos/acme/widgets/pulls?state=open&head=acme%3Afixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue&per_page=2","GET /repos/acme/widgets/git/commits/commit-substituted-55555555555555555555555555555555555555","GET /repos/acme/widgets/git/ref/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue","GET /repos/acme/widgets/pulls?state=open&head=acme%3Afixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue&per_page=2","GET /repos/acme/widgets/git/commits/commit-substituted-55555555555555555555555555555555555555","GET /repos/acme/widgets/git/ref/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue"],"s
```

1. Run 08-publication-recovery.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: The substituted head was accepted by both getExistingDraft and the real recoverPublication wrapper. getExistingDraft (rest.ts:140-183) validates only that the draft head sha matches the ref and that the head commit has exactly one parent equal to baseSha (rest.ts:168-175); it never reads the commit tree or compares it to the originally verified tree digest. The persisted PublicationPlan (verified-publication.ts:8-12) contains only repo/branch/baseSha, so no expected-tree binding is possible. Two distinct trees with the same single parent are therefore interchangeable at recovery time.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires an actor able to rewrite the generated branch.

Impact: Records an unverified head as the completed Fix.

Smallest effective fix: Persist an expected tree/head digest in PublicationIntent and reject an existing draft whose head tree differs, including on replay reconciliation.


## macOS verifier cleanup targets one process group instead of all descendants

Severity: **low**. Fingerprint: `fixer/sandbox/macos-detached-descendant-lifetime`.

When a configured verification command executes repository-controlled code on macOS, that code can attempt to start a detached child in another process group. The source sandbox permits child creation, but the supervisor kills only the original command group. A descendant retaining inherited stdout can keep the close event and verification promise pending beyond the deadline; one using ignored stdio can instead remain alive after a successful return and during parent workspace inspection. This crosses the untrusted-check lifetime boundary into shared daemon work/process resources. The candidate is limited to retained work and potential concurrent writers; no host-file disclosure, actual service exhaustion or sandbox credential escape has been demonstrated.

Root cause: sandbox.execute treats process.kill(-child.pid) as complete teardown and resolves only from child.close. The macOS sandbox profile allows fork and same-sandbox child groups but supplies no descendant supervisor or process namespace. Changing session/group therefore falls outside the only kill target, while neither the timer nor verification independently terminates the pending operation or proves all writers are gone.

Intended behavior: Every verification descendant must be terminated before workspace inspection and cleanup.

### Source trace

1. [packages/fixer/src/verify.ts:200](/Users/xirothedev/workspace/graveshift/packages/fixer/src/verify.ts:200) — **entrypoint**, verifyPatch configured commands: A policy-accepted patch or repository file is executed by an operator-configured verification command. This condition requires a command that actually executes repository-controlled code; Git diff-only checks do not provide it.
2. [packages/fixer/src/sandbox.ts:151](/Users/xirothedev/workspace/graveshift/packages/fixer/src/sandbox.ts:151) — **propagation**, isolation macOS branch: The platform chooses sandbox-exec with macProfile. The policy permits process-fork and same-sandbox child operations, without Linux's PID namespace.
3. [packages/fixer/src/sandbox.ts:49](/Users/xirothedev/workspace/graveshift/packages/fixer/src/sandbox.ts:49) — **propagation**, execute spawn: The trusted supervisor starts a detached command group with piped stdout. Repository-controlled code can attempt to create another detached group and retain the pipe or ignore stdio.
4. [packages/fixer/src/sandbox.ts:58](/Users/xirothedev/workspace/graveshift/packages/fixer/src/sandbox.ts:58) — **propagation**, execute stop and timeout: Cleanup and the timeout signal only -child.pid. They do not enumerate or own the detached descendant group, and the timer does not independently reject the promise.
5. [packages/fixer/src/sandbox.ts:81](/Users/xirothedev/workspace/graveshift/packages/fixer/src/sandbox.ts:81) — **propagation**, execute close handler: Completion waits for close, which can remain pending while a separate descendant holds stdout. Conversely, ignored-stdio descendants need not prevent close and are not proven dead before returning.
6. [apps/daemon/src/attempt-lifetime.ts:27](/Users/xirothedev/workspace/graveshift/apps/daemon/src/attempt-lifetime.ts:27) — **propagation**, withAttemptLease: While the verification promise remains pending, the attempt scope can continue its lease heartbeat; its finally block has not run. A closed-stdio survivor instead overlaps verifyPatch's post-command workspace inspection.
7. [apps/daemon/src/command-lifetime.ts:27](/Users/xirothedev/workspace/graveshift/apps/daemon/src/command-lifetime.ts:27) — **sink**, drainCommands.stop: The daemon retains and drains pending Work promises, so a verification operation that outlives its deadline can also retain graceful drain. The minimal bounded observation is one dummy descendant or operation surviving a short deadline, not a stress test.

### Evidence

- [packages/fixer/src/sandbox.ts:61](/Users/xirothedev/workspace/graveshift/packages/fixer/src/sandbox.ts:61) — The sole termination target is the original negative child PID/process group.
- [packages/fixer/src/sandbox.ts:67](/Users/xirothedev/workspace/graveshift/packages/fixer/src/sandbox.ts:67) — The timer sets timedOut and calls stop but does not reject or resolve a still-open child result independently.
- [packages/fixer/src/sandbox.ts:81](/Users/xirothedev/workspace/graveshift/packages/fixer/src/sandbox.ts:81) — Only close resolves a running command; waiting on inherited stdout is therefore outside the timer's direct control.
- [packages/fixer/src/sandbox.ts:131](/Users/xirothedev/workspace/graveshift/packages/fixer/src/sandbox.ts:131) — The macOS policy permits process-fork. Unlike the Linux branch's --unshare-all path, it does not create a process namespace or bind all descendants to a supervisor-owned lifetime.
- [packages/fixer/src/sandbox-process.test.ts:66](/Users/xirothedev/workspace/graveshift/packages/fixer/src/sandbox-process.test.ts:66) — An existing source test intentionally spawns a detached child group from a sandboxed process and explicitly signals that group itself. It does not test supervisor cleanup after the parent exits or times out; the test was not run.
- [packages/fixer/src/verify.ts:210](/Users/xirothedev/workspace/graveshift/packages/fixer/src/verify.ts:210) — Host-side assertWorkspace follows a returned command, and finally removes the root at line 229 without a proof that every descendant has exited.
- [apps/daemon/src/command-handler.ts:61](/Users/xirothedev/workspace/graveshift/apps/daemon/src/command-handler.ts:61) — The HTTP handler bounds waiting with within(result), but the underlying command promise remains owned by drainCommands; this does not supply descendant cleanup.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"platformSeenBySandbox":"darwin","elapsedMs":10,"result":{"exitCode":0,"stdout":"foreground-done","timedOut":false},"foregroundExitedBeforeDeadline":true,"descendantWroteMarkerAfterSupervisorReturn":true,"note":"process.platform was patched to darwin and a shim execs sandbox-exec arguments unchanged; no real macOS sandbox policy is claimed. This tests only the supervisor teardown logic in execute()."}
```

1. Run 09-macos-sandbox-lifetime.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: A detached descendant kept running and wrote inside the workspace after runSandboxed returned, showing cleanup targeted only the original process group.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires macOS, a repository-executing verification command, and a detached child.

Impact: Demonstrated retained work and a workspace writer; no host credential escape or outage observed.

Smallest effective fix: Own the full process tree with a supervisor that independently rejects on timeout and proves all descendants exited before success, inspection, and removal.


## Password changes leave other pre-change Account bearers usable

Severity: **medium**. Fingerprint: `identity/account-password-change/stale-jwt`.

A holder of a copied, still-valid Account bearer can continue using it after the legitimate Account holder changes the password, for the remainder of the one-hour token lifetime. For the bootstrap Account, a bearer issued while mustChangePassword is true also becomes owner-capable when somebody else completes the password change. The source has no session-specific state that distinguishes the current caller's bearer from another holder's bearer. The stale-token acceptance was observed with two dummy sessions inside the compliant container; it requires prior possession of a valid token and stops at authority within that Account's own Organization.

Root cause: Account JWTs contain no session identifier or password epoch. setPassword changes only passwordHash and mustChangePassword, while AccountAuthGuard verifies the static signing key and current Account/Membership state without checking an issuance epoch or revocation state. Clearing mustChangePassword therefore affects every unexpired token for that Account, including separately held first-login tokens. Preserving the current password-changing session may be intentional, but this representation cannot invalidate other sessions separately.

Intended behavior: Changing a password must invalidate other pre-change Account bearers.

### Source trace

1. [apps/api/src/identity/controllers/account.controller.ts:47](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/controllers/account.controller.ts:47) — **entrypoint**, AccountController.login: An Account login before the password change issues the bearer later held by the attacker. The attacker must already possess this valid token.
2. [apps/api/src/identity/services/identity.service.ts:95](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:95) — **propagation**, IdentityService.login: The bearer contains Account sub/email and a 3600-second expiry, with no session identifier or password-version binding.
3. [apps/api/src/identity/controllers/account.controller.ts:62](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/controllers/account.controller.ts:62) — **propagation**, AccountController.changePassword: The legitimate holder uses a separate session to change the Account password; the service verifies the current password before writing the new hash.
4. [apps/api/src/identity/repo/identity.repo.ts:105](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/repo/identity.repo.ts:105) — **propagation**, PrismaIdentityRepo.setPassword: Only passwordHash and mustChangePassword are updated. No bearer-revocation state is changed.
5. [apps/api/src/identity/guards/account-auth.guard.ts:45](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/guards/account-auth.guard.ts:45) — **propagation**, AccountAuthGuard.canActivate: The old bearer still passes signature/audience verification before expiry. The stored Account exists, and its current mustChangePassword false value removes the first-login restriction for all such bearers.
6. [apps/api/src/identity/services/identity.service.ts:184](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:184) — **propagation**, IdentityService.createOAuthClient: The stale bearer supplies the same Account id, whose existing owner Membership and same-Organization Project satisfy the otherwise correct authorization checks.
7. [apps/api/src/identity/repo/identity.repo.ts:245](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/repo/identity.repo.ts:245) — **sink**, PrismaIdentityRepo.addOAuthClient: A holder of the pre-change token can create a new Project-bound OAuth client under the Account's Organization without knowing the new password.

### Evidence

- [apps/api/src/identity/services/identity.service.ts:95](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:95) — Account token issuance binds only sub/email, static issuer/audience/key and one-hour expiration.
- [apps/api/src/identity/services/identity.service.ts:202](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:202) — Changing the password correctly requires the current password, but the successful path does not revoke or rotate pre-existing bearer state.
- [apps/api/src/identity/repo/identity.repo.ts:108](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/repo/identity.repo.ts:108) — The password write changes only passwordHash and mustChangePassword.
- [apps/api/src/identity/guards/account-auth.guard.ts:56](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/guards/account-auth.guard.ts:56) — The strongest current-state controls reload Account and Memberships; they do not compare token issue time/version with the password change. The first-login gate uses the Account's current boolean.
- [apps/api/prisma/schema.prisma:56](/Users/xirothedev/workspace/graveshift/apps/api/prisma/schema.prisma:56) — Account has no session version, password-change time or revocation relation that the guard could consult.
- [apps/api/test/identity.e2e.test.ts:173](/Users/xirothedev/workspace/graveshift/apps/api/test/identity.e2e.test.ts:173) — The existing test expects a pre-change token to work after the root password change. This was read as source, not executed, and does not cover invalidating a separately held token.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"dummyAccountId":"dummy-account-1","twoDistinctSessions":true,"firstBearerBeforeChange":"accepted","passwordHashChanged":true,"firstBearerAfterChange":"accepted","secondBearerAfterChange":"accepted","newPasswordLogin":"accepted","oldPasswordLogin":"rejected:UnauthorizedException","firstTokenClaimKeys":["aud","email","exp","iat","iss","sid","sub"],"tokenHasPasswordEpochOrRevocation":false,"guardChecksOnlySignatureAccountStateAndMembership":true}
```

1. Run 10-stale-jwt.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: With dummy ids and a local HS256 stub, two logins produced distinct session tokens. After changePassword updated the stored hash via the service and fake repo, the first bearer was still accepted by the real AccountAuthGuard. The token carries only sub/email/standard JWT claims; no password epoch or revocation field exists, and the guard re-reads Account/membership state without comparing token issuance to the password change.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires prior possession of a valid bearer.

Impact: Retains owner capability inside the Account's own Organization.

Smallest effective fix: Add a password epoch or session version to Account JWTs and verify it against stored Account state in AccountAuthGuard.


## Email-based member addition can select an attacker who registered the intended member's email first

Severity: **medium**. Fingerprint: `identity/register-addMember/unverified-email-membership`.

An unauthenticated attacker can register a not-yet-registered person's email with an attacker-chosen password, without controlling that mailbox. If an Organization owner later adds the intended person by that email, the implementation immediately grants membership to the attacker's Account. The attacker can discover that Organization through profile and read its Project metadata or create Projects through the normal member routes. This requires the owner's independent add-member action; registration alone does not grant access to an existing Organization. The sequence was observed with dummy Accounts inside the compliant container.

Root cause: register treats syntactic email validity as sufficient to reserve the global Account identity. addMember subsequently treats the same unverified email as the authority for selecting the person who receives a protected Membership. There is no mailbox-verification state or email-bound invitation acceptance between those two operations. The owner check is present and correctly scoped, but it authenticates the grantor without authenticating the intended recipient's email ownership.

Intended behavior: Membership must be granted only to a principal that proves ownership of the invited email.

### Source trace

1. [apps/api/src/identity/controllers/account.controller.ts:38](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/controllers/account.controller.ts:38) — **entrypoint**, AccountController.register: Public POST /api/register accepts the intended member's email and an attacker-chosen password without a bearer or mailbox challenge.
2. [apps/api/src/identity/dto/identity.dto.ts:8](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/dto/identity.dto.ts:8) — **propagation**, RegisterDto: The email check establishes format and length; the request contains no proof of control of that email.
3. [apps/api/src/identity/services/identity.service.ts:79](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:79) — **propagation**, IdentityService.register: The email is stored with the attacker's password hash and mustChangePassword false. A previously unclaimed email is sufficient.
4. [apps/api/src/identity/services/identity.service.ts:90](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:90) — **propagation**, IdentityService.login: The attacker authenticates using the password chosen during registration and obtains a bearer for the preclaimed Account.
5. [apps/api/src/identity/controllers/organizations.controller.ts:69](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/controllers/organizations.controller.ts:69) — **propagation**, OrganizationsController.addMember: An existing Organization owner independently submits the intended person's email to the member-addition route.
6. [apps/api/src/identity/services/identity.service.ts:166](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:166) — **propagation**, IdentityService.addMember: The correctly scoped owner check passes, then the unverified email resolves directly to the attacker's Account and addMemberToOrg writes its member Membership.
7. [apps/api/src/identity/guards/account-auth.guard.ts:56](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/guards/account-auth.guard.ts:56) — **propagation**, AccountAuthGuard.canActivate: The attacker's valid bearer resolves to the stored Account, and its newly granted Membership satisfies the Organization gate.
8. [apps/api/src/identity/services/identity.service.ts:161](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:161) — **propagation**, IdentityService.listProjects: The attacker obtains orgId from its profile and now passes requireMembership for the owner's Organization.
9. [apps/api/src/identity/repo/identity.repo.ts:226](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/repo/identity.repo.ts:226) — **sink**, PrismaIdentityRepo.listProjects: The normal scoped query returns that Organization's Project records to the attacker-selected Account.

### Evidence

- [apps/api/prisma/schema.prisma:56](/Users/xirothedev/workspace/graveshift/apps/api/prisma/schema.prisma:56) — Account has a unique email and passwordHash but no email-ownership verification state; registration can reserve the identity before the intended person.
- [apps/api/src/identity/services/identity.service.ts:72](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:72) — Registration performs uniqueness lookup and password hashing, then adds the Account without mailbox verification.
- [apps/api/src/identity/services/identity.service.ts:166](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:166) — The strongest visible control is requireOwner(accountId, orgId); recipient selection nevertheless uses findAccountByEmail and immediately inserts membership.
- [apps/api/src/identity/services/identity.service.ts:108](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:108) — The attacker's own profile lists its Organization ids, so no unknown orgId is required after the owner grants membership.
- [apps/api/src/identity/services/identity.service.ts:143](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:143) — Project creation requires only Membership in the selected Organization, providing a bounded mutation consequence in addition to Project listing.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"dummyOwnerId":"dummy-account-1","dummyOrgId":"dummy-org-2","dummyAttackerId":"dummy-account-4","attackerRegisteredIntendedEmail":true,"attackerHasNoMailboxProof":true,"beforeOwnerGrant":"rejected:ForbiddenException","ownerAddMemberResult":{"accountId":"dummy-account-4","orgId":"dummy-org-2","role":"member"},"attackerProfileOrgs":[{"orgId":"dummy-org-2","role":"member"}],"attackerListProjects":[{"projectId":"dummy-project-3","orgId":"dummy-org-2","slug":"dummy-private-project"}],"attackerSeesOwnerOrgProject":true}
```

1. Run 11-unverified-email-membership.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: With dummy principals and an in-memory repo, an unauthenticated-style register reserved the intended member email using an attacker password. The owner then added that plain email and IdentityService.addMember resolved it directly to the attacker Account. The attacker, previously denied the Project list, could then list the owner Organization’s dummy Project. No mailbox-verification or invitation-acceptance state exists on this path.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires the owner to add an email already pre-registered by an attacker.

Impact: Grants attacker Project read and creation rights in the victim Organization.

Smallest effective fix: Replace direct add-by-email with an invitation accepted from the mailbox-verified recipient before Membership activation.


## Public identity routes bypass the configured throttle before password work

Severity: **low**. Fingerprint: `identity/register-login/unthrottled-argon2-work`.

Small valid unauthenticated registration requests trigger Argon2id hashing and Account insertion, while login requests naming an existing Account trigger password verification even when the password is wrong. AccountController does not use the configured ThrottlerGuard, although the sibling public OAuth token route explicitly installs it, so the omission is localized rather than a property of the throttler setup. If upstream admission and Bun's effective worker/queue controls do not protect the shared API budget, anonymous password work could reduce availability for other Organizations. The source establishes the admission gap and input-to-work path, not a measured service outage or unbounded native worker count.

Root cause: ThrottlerModule is configured without a global guard, and the public identity controller omits the per-route guard that OAuth token exchange explicitly installs. The identity service submits password work without a source-visible per-IP/global work budget or submission bound. Per-field and parser size limits do not stop repeated small requests. Runtime worker limits and deployed upstream controls may constrain the impact and are not assumed absent.

Intended behavior: Anonymous password work must be admitted under an effective rate and concurrency budget.

### Source trace

1. [apps/api/src/identity/controllers/account.controller.ts:38](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/controllers/account.controller.ts:38) — **entrypoint**, AccountController.register and AccountController.login: Public registration and the adjacent auth/login handler accept requests without an authentication or throttle guard.
2. [apps/api/src/app.module.ts:53](/Users/xirothedev/workspace/graveshift/apps/api/src/app.module.ts:53) — **propagation**, AppModule ThrottlerModule configuration: A configured throttler does not cover these routes automatically: AppModule registers no APP_GUARD and the identity module provides no alternative admission guard.
3. [apps/api/src/identity/dto/identity.dto.ts:8](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/dto/identity.dto.ts:8) — **propagation**, RegisterDto and LoginDto: A short syntactically valid email and 12-to-256-character password pass validation; a large request body is unnecessary.
4. [apps/api/src/identity/services/identity.service.ts:74](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:74) — **propagation**, IdentityService.register: An unused email passes the uniqueness lookup and reaches password hashing without a submission budget. Repeated unique emails avoid the duplicate-account early exit.
5. [apps/api/src/identity/services/identity.service.ts:81](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:81) — **sink**, IdentityService.register and IdentityService.login password operations: Registration submits Argon2id work to Bun.password.hash followed by durable Account creation; the independent existing-email login variant submits Bun.password.verify at line 92. These costs occur in the shared API process before successful authentication.

### Evidence

- [apps/api/src/identity/controllers/account.controller.ts:38](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/controllers/account.controller.ts:38) — Neither public identity handler has ThrottlerGuard; protected handlers explicitly declare their AccountAuthGuard.
- [apps/api/src/app.module.ts:53](/Users/xirothedev/workspace/graveshift/apps/api/src/app.module.ts:53) — The application configures a rate limit but does not install it globally; providers contain only RulesService and PolicyContextService, with no APP_GUARD.
- [apps/api/src/auth/controllers/oauth.controller.ts:20](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/controllers/oauth.controller.ts:20) — The sibling public OAuth token route explicitly installs ThrottlerGuard, showing the guard-based enforcement used elsewhere.
- [apps/api/src/identity/services/identity.service.ts:81](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:81) — An accepted unused email causes Argon2id hashing followed by durable Account creation via PrismaIdentityRepo.addAccount.
- [apps/api/src/identity/services/identity.service.ts:92](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/services/identity.service.ts:92) — A known email causes password verification even when the attempt will return UnauthorizedException; unknown emails short-circuit before this cost.
- [apps/api/src/identity/dto/identity.dto.ts:8](/Users/xirothedev/workspace/graveshift/apps/api/src/identity/dto/identity.dto.ts:8) — Input length limits are effective per request but do not bound aggregate submissions or work already admitted.
- [deploy/compose/graveshift.compose.yml:104](/Users/xirothedev/workspace/graveshift/deploy/compose/graveshift.compose.yml:104) — The optional support API publishes on loopback. This is a visible reachability constraint; public routing and any upstream work limits cannot be inferred from this scaffold.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"guardMetadata":{"accountRegister":[],"accountLogin":[],"oauthToken":["ThrottlerGuard"],"childExitCode":0},"passwordWork":{"hashCalls":1,"verifyCalls":2,"registerOutcome":"accepted","correctLoginOutcome":"accepted","wrongLoginOutcome":"rejected:UnauthorizedException","reachedRegisterWork":true,"reachedLoginWork":true,"reachedFailedLoginWork":true,"stubScope":"replaced only Bun.password.hash/verify with counting fakes for this process"}}
```

1. Run 12-unthrottled-argon2.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: Runtime metadata shows no guards on AccountController.register/login while OAuthController.token carries ThrottlerGuard. With Bun.password.hash/verify replaced by counting fakes, small dummy register/login requests reached password hashing and verification, including a failed login that still performed verify work. This confirms the localized admission gap and input-to-work path; it does not measure a service outage or decide upstream/runtime work limits.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires reachable identity routes without upstream admission.

Impact: Demonstrated admission gap and reached password work; no measured shared outage.

Smallest effective fix: Attach ThrottlerGuard to registration and login, or install an equivalent global admission guard, with a regression check on guard metadata.


## Kiro shell hook guard guesses the event shape and fails open outside a finite command denylist

Severity: **low**. Fingerprint: `kiro-hooks.guard-shell.event-shape-fail-open`.

The tracked `block-dangerous-shell` hook runs `node scripts/kiro/guard-shell.mjs` on every shell tool call. The script does not bind to any in-repo Kiro event schema: it reads stdin, heuristically JSON-parses it, probes eight guessed field locations for a command, and on a read error, an unrecognized shape, or an empty string returns '' and exits 0, which the repository's own documentation says allows the tool. Even when a command string is extracted, the decision is a single regex over the literal text, so semantically destructive variants (for example `rm -rf /;true`, `git push origin +main`, `git -c foo=bar push origin main`, `kubectl -n ns delete pod`) are not blocked. The sibling `secret-scan-on-save` hook repeats the shape-guessing pattern and also fails open, reading an arbitrary path from event JSON. The only statements of Kiro's exit-code contract and hook principal are repository-authored; no vendor schema, payload fixture, or runtime source is present, so exploitability depends on facts outside the repository.

Root cause: The guard treats unverified, event-supplied structure as trusted control input: `extractCommand` enumerates guessed JSON paths and falls back to allow (exit 0) whenever the actual event shape differs, and enforcement is a literal regex that misses semantically equivalent destructive commands. The event-shape, hook-enforcement, and hook-principal facts needed to decide whether a lower-trust tool/save event can reach that fail-open path are external to the repository and cannot be assumed.

Intended behavior: The shell hook must bind the real event shape and fail closed when the command cannot be identified.

### Source trace

1. [.kiro/hooks/block-dangerous-shell.json:7](/Users/xirothedev/workspace/graveshift/.kiro/hooks/block-dangerous-shell.json:7) — **entrypoint**, PreToolUse hook definition for the shell tool: The hook fires on PreToolUse with matcher `shell` and runs the fixed command string `node scripts/kiro/guard-shell.mjs`; no event data is interpolated into the command.
2. [scripts/kiro/guard-shell.mjs:10](/Users/xirothedev/workspace/graveshift/scripts/kiro/guard-shell.mjs:10) — **propagation**, readStdin failure path: Any stdin read failure is swallowed and converted to an empty string, removing the guard's only input.
3. [scripts/kiro/guard-shell.mjs:29](/Users/xirothedev/workspace/graveshift/scripts/kiro/guard-shell.mjs:29) — **propagation**, extractCommand candidate list: Eight guessed JSON locations are probed; an actual Kiro shape outside this list, or a parse result that is not a string/object, yields '' with no error.
4. [scripts/kiro/guard-shell.mjs:46](/Users/xirothedev/workspace/graveshift/scripts/kiro/guard-shell.mjs:46) — **propagation**, DANGEROUS regex decision: The security decision is one literal regex over the extracted command; semantic equivalents of the listed destructive commands do not match.
5. [scripts/kiro/guard-shell.mjs:55](/Users/xirothedev/workspace/graveshift/scripts/kiro/guard-shell.mjs:55) — **sink**, PreToolUse verdict on the developer host: On no match (including an empty extracted command) the script exits 0, which the repository states permits the shell tool to run.

### Evidence

- [.kiro/hooks/block-dangerous-shell.json:9](/Users/xirothedev/workspace/graveshift/.kiro/hooks/block-dangerous-shell.json:9) — Fixed `action.command` runs the guard script; the command string is not event-controlled.
- [scripts/kiro/guard-shell.mjs:6](/Users/xirothedev/workspace/graveshift/scripts/kiro/guard-shell.mjs:6) — The complete DANGEROUS denylist is a single finite regex over literal text.
- [scripts/kiro/guard-shell.mjs:12](/Users/xirothedev/workspace/graveshift/scripts/kiro/guard-shell.mjs:12) — readStdin catch returns '' on any read error.
- [scripts/kiro/guard-shell.mjs:42](/Users/xirothedev/workspace/graveshift/scripts/kiro/guard-shell.mjs:42) — extractCommand returns '' when no guessed field holds a string.
- [scripts/kiro/guard-shell.mjs:55](/Users/xirothedev/workspace/graveshift/scripts/kiro/guard-shell.mjs:55) — Exit 0 is reached for empty or unmatched commands.
- [scripts/kiro/secret-scan.mjs:62](/Users/xirothedev/workspace/graveshift/scripts/kiro/secret-scan.mjs:62) — Sibling save hook reads a path taken from guessed event fields with hook-process privileges.
- [KIRO_USAGE.md:13](/Users/xirothedev/workspace/graveshift/KIRO_USAGE.md:13) — The only exit-code/trigger statement is a repo-authored claim about Kiro CLI v3; no vendor source corroborates it.
- [.kiro/agents/sre-reviewer.json:7](/Users/xirothedev/workspace/graveshift/.kiro/agents/sre-reviewer.json:7) — Strongest source-visible control: restricted agents deny shell and all fs_write, and their allowed write paths exclude the hook config and scripts.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"exitCodes":{"recognizedShapeKnownDangerous":2,"recognizedShapeBenign":0,"unrecognizedShapeKnownDangerous":0,"semanticallyEquivalentCommand":0},"recognizedShapeBlocked":true,"benignShapeAllowed":true,"failOpenOnUnrecognizedShape":true,"regexMissOnSemanticEquivalent":true,"commandsExecuted":false}
```

1. Run 13-kiro-hook-guard.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: The real guard blocked the recognized literal shape (exit 2) and allowed a benign command (exit 0), but exited 0 both for a destructive command nested in an unprobed event shape and for the semantically equivalent "rm -rf /;true". That is the fail-open / missing regex boundary result, observed from exit codes only with dummy stdin; no shell command was executed.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires a hook event shape outside the eight guessed fields or a semantically equivalent command.

Impact: Developer-host guard bypass; no product-server boundary demonstrated.

Smallest effective fix: Validate the documented Kiro event schema, reject missing or unknown command fields with a blocking exit code, and normalize the command before denylist matching.


## Docker restart selection can cross Compose project boundaries

Severity: **medium**. Fingerprint: `packages/actuator/createDockerRestarter/compose-project-binding`.

When a Blessing is intended to restart one Project's worker service, a caller holding that fresh signed request can potentially cause the actuator's Docker identity to restart unrelated worker containers in other Compose projects on the same daemon. The writer selects all running containers with the service label and invokes restart for every returned ID. The request can remain exactly as approved and correctly signed; the unresolved issue is which resources that service name resolves to. This requires an enabled act-mode configuration, shared-daemon co-tenancy, per-project approval intent and a proxy that exposes both projects. The checked-in configuration is propose, and the in-repo platform-to-actuator producer is deferred. The wrong-target restart fan-out was observed with a recording backend inside the compliant container; deployed exposure remains owner/conditional.

Root cause: The trusted resource resolver in createDockerRestarter authorizes by com.docker.compose.service alone. ActionRequest has no signed Project or Compose-project scope, policy checks only the service name, and the backend neither adds a trusted com.docker.compose.project predicate nor verifies ownership of the returned container IDs before fan-out. A valid approval for one scoped service can therefore name a broader host-level resource set when projects share service names.

Intended behavior: A Blessing must authorize only the signed service resource scope.

### Source trace

1. [packages/actuator/src/handler.ts:35](/Users/xirothedev/workspace/graveshift/packages/actuator/src/handler.ts:35) — **entrypoint**, createActionHandler POST /actions: A request submitter delivers one signed runtime action through the bounded JSON action endpoint.
2. [packages/actuator/src/execute.ts:95](/Users/xirothedev/workspace/graveshift/packages/actuator/src/execute.ts:95) — **propagation**, createActuator.execute: The executor strictly parses the action and verifies its HMAC; this prevents mutation but authenticates only the resource fields present in the schema.
3. [packages/actuator/src/claims.ts:62](/Users/xirothedev/workspace/graveshift/packages/actuator/src/claims.ts:62) — **propagation**, admissionDecision: Admission checks the approval identity, action/incident binding, time, policy and action count for the signed service name.
4. [packages/policy/src/decide.ts:48](/Users/xirothedev/workspace/graveshift/packages/policy/src/decide.ts:48) — **propagation**, decide runtime allowlist: The explicit target allowlist compares ctx.service to rule service strings and cannot distinguish different Compose projects with the same service name.
5. [packages/actuator/src/admission-durable.ts:97](/Users/xirothedev/workspace/graveshift/packages/actuator/src/admission-durable.ts:97) — **propagation**, DurableAdmission.claim: A successful unique token/action claim commits before execution. This correctly prevents replay of the request but does not narrow its resolved container membership.
6. [packages/actuator/src/execute.ts:56](/Users/xirothedev/workspace/graveshift/packages/actuator/src/execute.ts:56) — **propagation**, run Docker restart: The backend receives only action.service; no Project or Compose-project identity is supplied.
7. [packages/actuator/src/backends.ts:22](/Users/xirothedev/workspace/graveshift/packages/actuator/src/backends.ts:22) — **propagation**, createDockerRestarter.restart container lookup: The Docker list filter contains only com.docker.compose.service=<service>. The returned set is not checked against another ownership predicate.
8. [packages/actuator/src/backends.ts:40](/Users/xirothedev/workspace/graveshift/packages/actuator/src/backends.ts:40) — **sink**, createDockerRestarter.restart fan-out: The actuator sends POST /containers/<Id>/restart for every returned ID under the host proxy's Docker authority, potentially including the unrelated project's same-named service.

### Evidence

- [packages/actuator/src/types.ts:7](/Users/xirothedev/workspace/graveshift/packages/actuator/src/types.ts:7) — The strict action object includes action/incident IDs, service, runtime, kind and optional replicas, with no Project, Compose-project or deployment selector.
- [packages/actuator/src/sign.ts:18](/Users/xirothedev/workspace/graveshift/packages/actuator/src/sign.ts:18) — The signature covers the entire accepted action, approval and context, which prevents tampering but cannot bind a resource scope absent from that object.
- [packages/actuator/src/backends.ts:22](/Users/xirothedev/workspace/graveshift/packages/actuator/src/backends.ts:22) — The sole lookup predicate is the Compose service label; lines 38-46 restart every returned container.
- [packages/actuator/src/main.ts:74](/Users/xirothedev/workspace/graveshift/packages/actuator/src/main.ts:74) — The production launcher instantiates this backend from DOCKER_PROXY_URL without an additional Project or Compose-project binding.
- [deploy/compose/graveshift.compose.yml:29](/Users/xirothedev/workspace/graveshift/deploy/compose/graveshift.compose.yml:29) — The maintained actuator proxy mounts the host Docker socket and enables container access, POST and restarts. No project-specific filtering is expressed here; effective image and deployment behavior remain unverified.
- [graveshift.config.yaml:62](/Users/xirothedev/workspace/graveshift/graveshift.config.yaml:62) — The committed default mode is propose, so activation of the runtime sink requires an owner-reviewed act-mode configuration.
- [docs/adr/0017-deployment-topology.md:76](/Users/xirothedev/workspace/graveshift/docs/adr/0017-deployment-topology.md:76) — The platform-to-actuator producer is described as a future action hop rather than part of the current Fix path. Reachability from a real approval producer must be established separately.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"listDecodedFilters":"{\"label\":[\"com.docker.compose.service=worker\"]}","listFilter":{"label":["com.docker.compose.service=worker"]},"listFilterHasProjectPredicate":false,"restartTargets":["container-aaaadummy","container-bbbbdummy"],"bothDifferentProjectContainersRestarted":true,"restartMethods":["POST","POST"]}
```

1. Run 14-actuator-docker-project.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: The list filter contains only the com.docker.compose.service label with no project predicate; both containers (dummy-project-alpha and dummy-project-beta) were POST-restarted.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires act mode, shared-daemon co-tenancy, and duplicate service labels.

Impact: Restarts containers belonging to another Compose project.

Smallest effective fix: Add a signed Project or Compose-project predicate to the signed action and container lookup, and verify returned container ownership before restart fan-out.


## Runtime admission substitutes zero for authoritative policy usage

Severity: **medium**. Fingerprint: `packages/actuator/runtimeDecision/zeroed-policy-usage`.

In a supported act-mode configuration, a submitter holding a still-valid signed Blessing issued before usage limits were reached can potentially execute a restart after recorded diagnosis-loop or Project daily-spend limits require denial. Runtime admission supplies zero for those quantities instead of obtaining current recorded usage, while the canonical policy gate applies both limits to runtime actions. Correct HMAC, an allowed human approver, target allowlisting, safe scale bounds and the local runtime action count remain required. The affected boundary is the admission owner's current policy decision under the actuator's Docker or Kubernetes authority. The shared helper is used by both the active local SQLite path and the optional API claim path. The denial bypass and stub backend invocation were observed inside the compliant container.

Root cause: claims.runtimeDecision reconstructs SharedPolicyContext with diagnosisLoops: 0 and llmSpentTodayUsd: 0 for every request. These are authoritative state facts, not known-zero properties of a runtime operation. ContextSchema cannot carry them, AdmissionRules has no usage reader, and neither SQLite admission nor API ActionRepo resolves the recorded Project/incident usage before calling this helper. PolicyContextService and AuditRepo already demonstrate the authoritative values and fail-closed handling elsewhere, but runtime admission bypasses that dependency.

Intended behavior: Runtime admission must evaluate policy with authoritative recorded usage.

### Source trace

1. [packages/actuator/src/handler.ts:46](/Users/xirothedev/workspace/graveshift/packages/actuator/src/handler.ts:46) — **entrypoint**, createActionHandler POST /actions: The request holder submits an unconsumed signed runtime action whose approval interval still includes the delivery time.
2. [packages/actuator/src/execute.ts:95](/Users/xirothedev/workspace/graveshift/packages/actuator/src/execute.ts:95) — **propagation**, createActuator.execute validation and signature: Strict parsing and HMAC verification authenticate the action, approval and available context. The signed context has no authoritative usage counters.
3. [packages/actuator/src/admission-durable.ts:68](/Users/xirothedev/workspace/graveshift/packages/actuator/src/admission-durable.ts:68) — **propagation**, DurableAdmission.claim eligibility: The active store obtains its clock and per-service action count and calls admissionDecision. It has no dependency that reads recorded diagnosis-loop or daily-spend usage.
4. [packages/actuator/src/claims.ts:153](/Users/xirothedev/workspace/graveshift/packages/actuator/src/claims.ts:153) — **propagation**, runtimeDecision policy facts: The helper passes zero diagnosisLoops and zero llmSpentTodayUsd into the canonical policy engine, irrespective of the real recorded state.
5. [packages/policy/src/evaluation.ts:36](/Users/xirothedev/workspace/graveshift/packages/policy/src/evaluation.ts:36) — **propagation**, gate usage limits: This gate denies runtime actions when either actual usage quantity reaches its configured limit, but the substituted zeros pass positive limits when the other checks pass.
6. [packages/actuator/src/claims.ts:165](/Users/xirothedev/workspace/graveshift/packages/actuator/src/claims.ts:165) — **propagation**, runtimeDecision accepted policy result: A require_approval decision from the incomplete facts becomes no denial reason, allowing the valid human approval to satisfy admission.
7. [packages/actuator/src/admission-durable.ts:97](/Users/xirothedev/workspace/graveshift/packages/actuator/src/admission-durable.ts:97) — **propagation**, DurableAdmission.claim commit: The token/action claim is committed under the incomplete policy decision and reported as claimed.
8. [packages/actuator/src/execute.ts:121](/Users/xirothedev/workspace/graveshift/packages/actuator/src/execute.ts:121) — **propagation**, createActuator.execute late eligibility and dispatch: The late check covers approval eligibility and breaker state only; it does not fetch usage or restore the omitted policy gate inputs before run is invoked.
9. [packages/actuator/src/backends.ts:40](/Users/xirothedev/workspace/graveshift/packages/actuator/src/backends.ts:40) — **sink**, createDockerRestarter.restart: For a valid Docker restart action, the privileged backend sends the container restart request even though a policy decision with the recorded usage would require denial. This final result remains to be demonstrated with a recording stub.

### Evidence

- [packages/core/src/policy-context.ts:11](/Users/xirothedev/workspace/graveshift/packages/core/src/policy-context.ts:11) — The shared policy contract requires complete facts and explicitly states that missing counters are never inferred.
- [packages/actuator/src/claims.ts:153](/Users/xirothedev/workspace/graveshift/packages/actuator/src/claims.ts:153) — Runtime decision supplies actionsLast10Min from admission but hardcodes diagnosisLoops and llmSpentTodayUsd to zero. openPrsLastHour is also zero, but it is not used by the runtime-specific PR/action branch and is not part of this claim.
- [packages/policy/src/evaluation.ts:38](/Users/xirothedev/workspace/graveshift/packages/policy/src/evaluation.ts:38) — Diagnosis-loop and daily-spend limits are unconditional gate terms after the runtime-versus-PR rate-count choice. They therefore apply to runtime actions.
- [packages/actuator/src/types.ts:36](/Users/xirothedev/workspace/graveshift/packages/actuator/src/types.ts:36) — The strict signed context permits only category, signals and confidence, so even an honest request producer cannot provide these omitted facts through the current wire contract.
- [packages/actuator/src/admission-durable.ts:69](/Users/xirothedev/workspace/graveshift/packages/actuator/src/admission-durable.ts:69) — The production local admission path obtains only the per-service runtime action count before invoking the shared runtime decision.
- [apps/api/src/actions/action.repo.ts:57](/Users/xirothedev/workspace/graveshift/apps/api/src/actions/action.repo.ts:57) — The optional API claim path calls the same runtimeDecision helper after counting action claims; it does not resolve Project/incident policy usage either. This is a source-visible sibling variant of the same root cause.
- [apps/api/src/internal/policy-context.service.ts:31](/Users/xirothedev/workspace/graveshift/apps/api/src/internal/policy-context.service.ts:31) — The authoritative context path reads recorded usage for the granted Project, service and incident and includes it in SharedPolicyContext instead of assuming zero.
- [apps/api/src/audit/audit.usage.ts:20](/Users/xirothedev/workspace/graveshift/apps/api/src/audit/audit.usage.ts:20) — Recorded usage derives daily Project model spend and per-incident diagnosis-call counts. Parsing rejects unknown or invalid costs, establishing that unavailable usage must not silently become zero.
- [packages/actuator/src/claims.ts:75](/Users/xirothedev/workspace/graveshift/packages/actuator/src/claims.ts:75) — The post-claim eligibility recheck covers breaker and approval checks only, so there is no later authoritative-usage check that prevents the proposed effect.
- [packages/actuator/src/main.ts:53](/Users/xirothedev/workspace/graveshift/packages/actuator/src/main.ts:53) — The active launcher constructs DurableAdmission with policy, clock, audit, mode and breaker dependencies; no recorded-usage source is attached.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"recordedUsage":{"openPrsLastHour":2,"actionsLast10Min":7,"diagnosisLoops":50,"llmSpentTodayUsd":100},"policyLimits":{"maxOpenPrsPerHour":10,"maxActionsPerServicePer10Min":100,"maxDiagnosisLoops":3,"llmDailyBudgetUsd":10},"runtimeDecisionCounters":{"openPrsLastHour":0,"actionsLast10Min":7,"diagnosisLoops":0,"llmSpentTodayUsd":0},"runtimeDecisionReason":null,"fullContextCounters":{"openPrsLastHour":2,"actionsLast10Min":7,"diagnosisLoops":50,"llmSpentTodayUsd":100},"fullContextDecision":{"effect":"deny","reason":"rate_limited","matchedRule":"allow-restart"},"fullContextDenied":true,"runtimeBypassed":true}
```

1. Run 15-actuator-zero-usage.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: The full SharedPolicyContext is denied as rate_limited by the positive diagnosisLoops/daily-spend limits, but runtimeDecision returns no denial because it zeroes diagnosisLoops and llmSpentTodayUsd.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires an approved action delivered after limits are reached.

Impact: Executes a runtime action that current policy would deny.

Smallest effective fix: Resolve diagnosis-loop and daily-spend usage from the authoritative Project context before calling runtimeDecision, on both local and API admission paths.


## Event replay keys cross Project boundaries

Severity: **medium**. Fingerprint: `packages/events/src/consumer.ts:projectless-event-dedupe`.

A plugin Credential holder confined to one Project controls its Event IDs. If it knows or predicts an ID used by a different granted Project, it can submit an otherwise valid warning Event with that ID first. The shared consumer subsequently acknowledges the other Project's Event as already completed without dispatching its detection. A warning Event whose type does not produce detections can seed this state without a model call. Publisher msgID uses the same unscoped ID in the all-Project stream, creating a second place where the collision may suppress delivery. The cross-Project acknowledgement without dispatch was observed with a fake transport inside the compliant container; target-ID knowledge and a shared stream/consumer remain deployment prerequisites.

Root cause: Project authority is present in the subject and body but omitted from replay identity: createNatsPublisher sends msgID=prepared.id and processQueued checks/marks a single shared Set using envelope.id. The API preserves producer-chosen IDs and does not establish global uniqueness. A 100000-entry size bound limits retained keys but does not isolate them.

Intended behavior: Event replay identity must be scoped by Project.

### Source trace

1. [apps/api/src/auth/dto/publish-event.dto.ts:13](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/dto/publish-event.dto.ts:13) — **entrypoint**, PublishEventDto.id: The producer supplies any nonempty string as its Event ID; the contract adds no Project namespace or globally unique server ID.
2. [apps/api/src/auth/services/event-ingest.service.ts:30](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/services/event-ingest.service.ts:30) — **propagation**, EventIngestService.ingest: Scope, Project and service binding are enforced, then the original Event ID is preserved through preparation and publication.
3. [packages/events/src/publisher.ts:23](/Users/xirothedev/workspace/graveshift/packages/events/src/publisher.ts:23) — **propagation**, createNatsPublisher.publish: Every Project uses prepared.id alone as the broker msgID, while the subject includes its Project.
4. [packages/events/src/streams.ts:18](/Users/xirothedev/workspace/graveshift/packages/events/src/streams.ts:18) — **propagation**, GRAVESHIFT_EVENTS_STREAM: The one stream spans all Project subjects and declares a 120-second duplicate window.
5. [packages/events/src/consumer.ts:91](/Users/xirothedev/workspace/graveshift/packages/events/src/consumer.ts:91) — **propagation**, processQueued Project check: Both dummy Projects can legitimately pass the granted set; their distinct subjects and bodies pass exact reconstruction.
6. [packages/events/src/consumer.ts:105](/Users/xirothedev/workspace/graveshift/packages/events/src/consumer.ts:105) — **sink**, processQueued completed-ID fast path: After the first Project's successful processing marks the ID at line 113, an Event with the same ID from the second Project is acknowledged and returned without calling process.

### Evidence

- [packages/events/src/streams.ts:55](/Users/xirothedev/workspace/graveshift/packages/events/src/streams.ts:55) — The completed-ID Set has one global string namespace and only an oldest-entry size eviction.
- [packages/events/src/consumer.ts:126](/Users/xirothedev/workspace/graveshift/packages/events/src/consumer.ts:126) — One deduplicator is created for the consumer serving every granted Project.
- [apps/daemon/src/observations.ts:99](/Users/xirothedev/workspace/graveshift/apps/daemon/src/observations.ts:99) — An accepted envelope type with no watcher outcomes still finishes observation processing, allowing the transport to mark its ID completed.
- [packages/watcher/src/rules.ts:60](/Users/xirothedev/workspace/graveshift/packages/watcher/src/rules.ts:60) — The watcher uses [projectId,id] for replay identity, demonstrating the stronger downstream namespace that the consumer bypasses.
- [packages/events/src/consumer.ts:65](/Users/xirothedev/workspace/graveshift/packages/events/src/consumer.ts:65) — Size, schema, exact subject equality and granted-Project controls are present; none changes the unscoped replay key after both valid Projects pass.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"sharedId":"same-envelope-id","grantedProjectIds":["101","202"],"decodedProjects":["101","202"],"firstType":"no-detection","secondType":"runtime.oom","processedCount":1,"processed":[{"id":"same-envelope-id","projectId":"101","type":"no-detection"}],"acks":["101","202"],"terms":[],"naks":[],"deadLetters":[],"firstAcked":true,"secondAcked":true,"secondProcessed":false}
```

1. Run 16-event-dedupe.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: Dedupe is keyed on envelope.id alone: project 202 reused id "same-envelope-id", was acknowledged on the dedupe branch, and never reached the process callback (which would have produced runtime.oom).

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires a predictable target Event ID and a shared consumer.

Impact: Suppresses another Project's observation without dispatch.

Smallest effective fix: Namespace publisher msgID and consumer completed-ID keys by [projectId, id] while preserving same-Project replay deduplication.


## A permanently rejected workload name can block the shared Collector queue

Severity: **low**. Fingerprint: `packages/integrations/src/delivery.ts:permanent-collector-poison-retry`.

An enabled Kubernetes Collector watches multiple configured namespaces through one ordered queue. A less-trusted workload owner who can choose a legal name containing a dummy model-key-shaped substring, such as demo-sk-aaaaaaaaaaaaaaaaaaaa, can produce a Warning Event that maps to an observation whose service fails privacy validation. The queue retries that deterministic failure forever, blocking later observations from other watched workloads. The Docker variant uses a producer-controlled com.docker.compose.service label containing a dummy email such as ops@example.invalid. The affected resource is the Collector's observation lane; no process crash or suppression beyond that Collector is claimed. Each variant requires delegated workload metadata authority and normally functioning Collector publication; the head-of-line result was observed with two dummy records inside the compliant container.

Root cause: createDeliveryQueue retries all entry.deliver and publisher errors indefinitely without distinguishing permanent validation failures, enforcing an attempt/deadline limit, or quarantining the head record. Both Collectors prepare workload-derived service metadata inside entry.deliver, where assertSafeMetadata can always reject it. The queue's 256-record bound and one-second manual stop deadline do not allow healthy records past that head during normal operation.

Intended behavior: One permanently invalid workload record must not block the shared Collector queue.

### Source trace

1. [packages/sources-k8s/src/kube-api.ts:23](/Users/xirothedev/workspace/graveshift/packages/sources-k8s/src/kube-api.ts:23) — **entrypoint**, toEvent: A schema-valid Warning Event carries the workload's involvedObject.name into involvedName. The parser has no privacy-pattern restriction on workload names.
2. [packages/sources-k8s/src/source.ts:99](/Users/xirothedev/workspace/graveshift/packages/sources-k8s/src/source.ts:99) — **propagation**, Kubernetes watch callback: An included namespace's workload name becomes the qualified Grave service and mapped runtime Event details in one shared Collector queue.
3. [packages/sources-k8s/src/source.ts:105](/Users/xirothedev/workspace/graveshift/packages/sources-k8s/src/source.ts:105) — **propagation**, queued Kubernetes delivery: entry.deliver constructs its envelope using the workload-derived service before sending it. A name such as demo-sk-aaaaaaaaaaaaaaaaaaaa retains a word boundary before the key-shaped substring even after qualification.
4. [packages/integrations/src/index.ts:94](/Users/xirothedev/workspace/graveshift/packages/integrations/src/index.ts:94) — **propagation**, envelopeBuilder: The helper passes Context.service into prepareEnvelope, preserving the workload-derived selector as routing metadata.
5. [packages/core/src/privacy.ts:8](/Users/xirothedev/workspace/graveshift/packages/core/src/privacy.ts:8) — **propagation**, assertSafeMetadata: The model-key detector matches the dummy sk- substring and rejects the non-UUID service with EnvelopeError on every attempt.
6. [packages/integrations/src/delivery.ts:46](/Users/xirothedev/workspace/graveshift/packages/integrations/src/delivery.ts:46) — **propagation**, createDeliveryQueue.retry: The same permanent validation exception is caught and retried with capped backoff until the queue is externally stopped.
7. [packages/integrations/src/delivery.ts:71](/Users/xirothedev/workspace/graveshift/packages/integrations/src/delivery.ts:71) — **sink**, ordered delivery worker: The worker never reaches acknowledge, pending.shift or notification for the poison head, so later unrelated workload records cannot publish through this Collector.

### Evidence

- [packages/redactor/src/detectors.ts:47](/Users/xirothedev/workspace/graveshift/packages/redactor/src/detectors.ts:47) — The explicit model-key regex accepts a sk- prefix followed by at least twenty allowed characters, including the dummy all-letter example.
- [packages/core/src/envelope.ts:60](/Users/xirothedev/workspace/graveshift/packages/core/src/envelope.ts:60) — Service and fingerprint are privacy-checked routing metadata rather than redacted payload fields.
- [packages/sources-k8s/src/source.ts:140](/Users/xirothedev/workspace/graveshift/packages/sources-k8s/src/source.ts:140) — A full queue aborts the push watch, but finally waits on queue.drain; this cannot bypass a permanently failing head or reconnect to healthy later records.
- [packages/sources-docker/src/source.ts:92](/Users/xirothedev/workspace/graveshift/packages/sources-docker/src/source.ts:92) — The Docker variant trusts the com.docker.compose.service attribute for service and constructs its envelope inside the same retrying delivery callback at lines 99-110. An email-shaped label deterministically fails the separate email metadata detector.
- [packages/integrations/src/delivery.ts:88](/Users/xirothedev/workspace/graveshift/packages/integrations/src/delivery.ts:88) — ready prevents more than 256 pending records but keeps Docker waiting behind the head. stop at line 123 provides manual bounded cancellation, not automatic quarantine.
- [apps/daemon/src/collectors.ts:60](/Users/xirothedev/workspace/graveshift/apps/daemon/src/collectors.ts:60) — The active daemon factory can enable Docker and Kubernetes Collectors, each sharing one queue across its collected workloads. The effective enabled deployment and delegated workload authority are not established by this source-only review.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"retryLimit":5,"poisonAccepted":true,"healthyAccepted":true,"poisonDeliverCalls":5,"healthyDeliverCalls":0,"published":[],"publishedCount":0,"acknowledgeCalls":0,"sleepDelays":[500,1000,2000,4000,8000],"sleepDelayMsIgnored":true}
```

1. Run 17-collector-poison.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: The retry loop has no attempt cap: the head record threw on every delivery, so entries() kept yielding pending[0]; the healthy record never reached deliver() and the publisher received nothing.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires delegated control of a workload name or label.

Impact: Demonstrated head-of-line blocking in a fixture; no measured service-wide outage.

Smallest effective fix: Distinguish permanent validation failures from transient errors, quarantine or drop them, and continue with later records.


## Allowed telemetry strings may cause superlinear synchronous redaction before truncation

Severity: **low**. Fingerprint: `packages/redactor/src/detectors.ts:email-unanchored-scan`.

A producer holding a service-bound plugin Credential can submit a valid Sentry event with a long alphabetic event.type below the one-MiB envelope limit. The mapper redacts that entire string before truncating its normalized type to 128 characters, and its payload projection can omit the original top-level type. The shared email detector has an unanchored greedy local-part expression that can repeatedly scan suffixes of a non-matching token. This creates a source-grounded candidate from one Project's telemetry capability to CPU work on the shared API process; the final Event can be small enough for the broker cap. Plugin payload and identity processing reach the same detector under the smaller plugin request cap. No timing, service interruption, or cross-Project delay was demonstrated, and no severity is assigned.

Root cause: The shared redactor applies an unanchored, potentially quadratic email regex synchronously to caller-controlled strings without a per-string work budget. Sentry eventType invokes it before the only type-length truncation. The strongest visible controls are the one-MiB Sentry raw/parser caps, the plugin default 65,536-byte and maximum 102,400-byte cap, client request throttling, four redaction passes, and a downstream 128-KiB stream message limit. They bound request count, total bytes, passes, or final publication size, but do not establish linear regex work or preempt a synchronous call. Whether the supported Bun engine optimizes this pattern enough to prevent meaningful shared impact is unresolved.

Intended behavior: A bounded telemetry string must not cause disproportionate synchronous work.

### Source trace

1. [apps/api/src/auth/controllers/sentry-events.controller.ts:62](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/controllers/sentry-events.controller.ts:62) — **entrypoint**, SentryEventsController.ingest: A throttled caller with a valid plugin publish Credential submits an envelope; Project and service remain constrained by SentryKeyGuard.
2. [apps/api/src/app.factory.ts:17](/Users/xirothedev/workspace/graveshift/apps/api/src/app.factory.ts:17) — **propagation**, configureApp raw envelope parser: The route accepts a raw envelope up to one MiB; it does not impose a separate maximum on the JSON event.type string.
3. [apps/api/src/auth/sentry-envelope.parser.ts:49](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/sentry-envelope.parser.ts:49) — **propagation**, eventPayload and parseSentryEnvelope: The parser checks whole-envelope and event-item byte caps and parses an event JSON object without a per-field string-length bound.
4. [apps/api/src/auth/services/sentry-ingest.service.ts:72](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/services/sentry-ingest.service.ts:72) — **propagation**, SentryIngestService.ingest: The accepted event object is passed to mapSentryEvent before final envelope validation or broker publication.
5. [apps/api/src/auth/sentry-event.mapper.ts:23](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/sentry-event.mapper.ts:23) — **propagation**, eventType: The raw exception type or event.type is passed to redact in full at line 25; the 128-character slice occurs afterward at line 28. A long top-level event.type is not copied into the mapped payload.
6. [packages/redactor/src/index.ts:12](/Users/xirothedev/workspace/graveshift/packages/redactor/src/index.ts:12) — **propagation**, pass and redact: The synchronous detector loop calls String.replace for the email expression on the API request's execution path; the maximum of four passes does not limit the work of one match attempt.
7. [packages/redactor/src/detectors.ts:79](/Users/xirothedev/workspace/graveshift/packages/redactor/src/detectors.ts:79) — **sink**, DETECTORS email pattern: The unanchored [A-Za-z0-9._%+-]+ local part followed by a required @ can rescan successive suffixes of a long non-matching alphabetic token. Engine behavior and meaningful shared CPU delay require bounded validation.

### Evidence

- [apps/api/src/auth/sentry-event.mapper.ts:19](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/sentry-event.mapper.ts:19) — eventType chooses unbounded event text, redacts before truncation, then emits at most 128 normalized suffix characters; the mapped payload at lines 87-91 contains only exception, message, and request.
- [packages/redactor/src/detectors.ts:79](/Users/xirothedev/workspace/graveshift/packages/redactor/src/detectors.ts:79) — The email pattern is /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, with no preceding token boundary or explicit local-part length bound.
- [packages/redactor/src/index.ts:23](/Users/xirothedev/workspace/graveshift/packages/redactor/src/index.ts:23) — redact invokes detector passes synchronously and has no cancellation, worker isolation, or elapsed-work budget.
- [apps/api/src/app.factory.ts:24](/Users/xirothedev/workspace/graveshift/apps/api/src/app.factory.ts:24) — The Sentry raw-body limit is one MiB; this is an effective input-byte control but permits a long single type token.
- [apps/api/src/auth/sentry-envelope.parser.ts:80](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/sentry-envelope.parser.ts:80) — The parser independently enforces the default whole-envelope and event-item byte limits before event mapping; the candidate must remain within both.
- [apps/api/src/app.module.ts:57](/Users/xirothedev/workspace/graveshift/apps/api/src/app.module.ts:57) — Both ingestion controllers use the configured client throttler. A meaningful proof must use a single admitted request, rather than rely on bypassing or exceeding the rate limit.
- [apps/api/src/auth/env.schema.ts:35](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/env.schema.ts:35) — Plugin events have a 65,536-byte default and 102,400-byte configuration ceiling; the adjacent throttler defaults to 60 requests per 60,000 ms.
- [packages/core/src/envelope.ts:18](/Users/xirothedev/workspace/graveshift/packages/core/src/envelope.ts:18) — The plugin sibling reaches redact through recursive payload cleaning; privacy.ts also applies the same detector set to metadata using hasSensitiveText.
- [packages/events/src/streams.ts:11](/Users/xirothedev/workspace/graveshift/packages/events/src/streams.ts:11) — The declared 128-KiB stream message limit is downstream of the Sentry type redaction and can still admit the mapper's small final representation.
- [apps/api/src/main.ts:14](/Users/xirothedev/workspace/graveshift/apps/api/src/main.ts:14) — The API bootstrap starts one Nest application listener. The reviewed redaction path executes in that application, without a source-visible per-Project worker boundary.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"sizes":[256,512,1024,2048],"iterations":3,"timingsNs":[13000,42542,159083,615625],"timingsMs":[0.013,0.0425,0.1591,0.6156],"doublingRatios":[3.272,3.739,3.87],"growthExponents":[1.71,1.903,1.952],"nonMatchingInputUnchanged":[true,true,true,true]}
```

1. Run 18-redactor-regex.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: Each doubling of a non-matching ASCII string more than doubled redact() time (exponent > 1.5), consistent with the unanchored email pattern backtracking from every start index.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires a long non-matching telemetry string within the accepted byte caps.

Impact: Demonstrated cost growth; no measured delay to unrelated work.

Smallest effective fix: Anchor and bound the email detector's local part and impose a per-string scan limit before redaction.


## Caller timestamps can grow temporal watcher arrays without a bound

Severity: **low**. Fingerprint: `packages/watcher/src/rules.ts:unbounded-temporal-samples`.

A plugin Credential holder can submit unique small warning log.line or runtime.restart Events for its bound service while keeping observedAt at one valid timestamp. Each unique Event passes the replay set, and every saved timestamp remains inside inWindow because the comparison uses that same caller timestamp. The error/restart array is then filtered and copied on every input without saturation at the detection threshold. The downstream ten-minute dedupe prevents repeated emitted detections but runs after this work and does not cap sample retention. Source therefore gives linear retained samples and quadratic cumulative array work for a linear number of accepted Events, even when arrival rate respects the API throttle. The shared serial consumer makes this a possible cost imposed on other Projects; no measured delay or availability failure is claimed.

Root cause: Temporal counting stores every matching timestamp in unbounded arrays and ages them only relative to the next untrusted observedAt. There is no count cap or independent expiration. The 10000-entry replay-ID set bounds only identity storage, and detection dedupe happens after the arrays have already grown and been copied.

Intended behavior: Temporal sample storage and work must be bounded by the rule threshold and window.

### Source trace

1. [apps/api/src/auth/dto/publish-event.dto.ts:43](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/dto/publish-event.dto.ts:43) — **entrypoint**, PublishEventDto.observedAt: The producer chooses an ISO timestamp; no freshness, advancement or maximum equal-timestamp sample count is enforced. Project/service binding still applies.
2. [apps/daemon/src/observations.ts:99](/Users/xirothedev/workspace/graveshift/apps/daemon/src/observations.ts:99) — **propagation**, observe watcher intake: The shared daemon forwards each newly identified warning Event to watcher.ingest with the producer timestamp unchanged.
3. [packages/watcher/src/watcher.ts:32](/Users/xirothedev/workspace/graveshift/packages/watcher/src/watcher.ts:32) — **propagation**, createWatcher.ingest: observe(envelope) evaluates and mutates temporal rule state before createDedupe.accept is called at line 38.
4. [packages/watcher/src/rules.ts:60](/Users/xirothedev/workspace/graveshift/packages/watcher/src/rules.ts:60) — **propagation**, createRules replay and time extraction: Distinct IDs bypass replay suppression. The bounded observed Set does not limit per-service arrays, and at is parsed directly from observedAt.
5. [packages/watcher/src/rules.ts:23](/Users/xirothedev/workspace/graveshift/packages/watcher/src/rules.ts:23) — **propagation**, inWindow: All prior samples equal to at satisfy time > at-windowMs and time <= at, regardless of elapsed wall time. Every input scans the full retained array.
6. [packages/watcher/src/rules.ts:111](/Users/xirothedev/workspace/graveshift/packages/watcher/src/rules.ts:111) — **sink**, log.line temporal accumulation: The filtered array is copied and appended with no count limit. runtime.restart repeats the same pattern at line 94, retaining growing arrays in the shared watcher's per-service state.

### Evidence

- [packages/watcher/src/rules.ts:32](/Users/xirothedev/workspace/graveshift/packages/watcher/src/rules.ts:32) — Per-Project/service temporal states have no independent expiry; their errors and restarts arrays survive downstream processing and dedupe.
- [packages/watcher/src/rules.ts:94](/Users/xirothedev/workspace/graveshift/packages/watcher/src/rules.ts:94) — The restart-count variant filters and spreads all samples even after its threshold of three has been crossed.
- [packages/watcher/src/types.ts:50](/Users/xirothedev/workspace/graveshift/packages/watcher/src/types.ts:50) — The detector only needs small fixed thresholds: five errors or three restarts. No corresponding storage maximum accompanies the configured windows.
- [packages/watcher/src/pipeline.ts:19](/Users/xirothedev/workspace/graveshift/packages/watcher/src/pipeline.ts:19) — Detection dedupe stores a last accepted timestamp and rejects repeated detections, but it cannot undo the preceding temporal-array mutation.
- [apps/api/src/auth/env.schema.ts:35](/Users/xirothedev/workspace/graveshift/apps/api/src/auth/env.schema.ts:35) — Body and rate limits exist. They do not impose a lifetime sample quota or require producer timestamps to track the arrival clock.
- [packages/events/src/consumer.ts:139](/Users/xirothedev/workspace/graveshift/packages/events/src/consumer.ts:139) — The one consumer awaits each Project's processing serially, making per-Event growing array work part of shared observation dispatch.
- [packages/core/src/envelope.ts:54](/Users/xirothedev/workspace/graveshift/packages/core/src/envelope.ts:54) — prepareEnvelope validates format and redacts content but preserves the caller-supplied observedAt unchanged; no server time is substituted, so the timestamp driving inWindow is producer-controlled.

### Bounded reproduction

Attacker perspective: Holder of the lower-trust capability described in the title.

Minimum inputs:

```text
{"observedAt":"2026-11-26T00:00:00.000Z","line":"ERROR: dummy failure in checkout","small":{"count":8,"visits":28,"expectedVisits":28,"filterCalls":8,"batches":[0,1,2,3,4,5,6,7],"retainedSamples":8,"detections":4},"large":{"count":16,"visits":120,"expectedVisits":120,"filterCalls":16,"batches":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],"retainedSamples":16,"detections":12},"visitRatio":4.286,"expectedQuadraticRatio":4,"noCountCap":true,"instrumentationRestored":true}
```

1. Run 19-temporal-samples.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result.

Observed result: Doubling unique error lines from 8 to 16 grew filter callback visits 4.29x (quadratic n(n-1)/2), and all samples were retained (8 -> 16) with no eviction cap on the error array.

### Conditions, priority and source fix

- system_configuration: The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace.

Likelihood: Requires repeated unique Events with stale or equal timestamps.

Impact: Demonstrated growing element visits; no measured service impact.

Smallest effective fix: Cap the error and restart arrays at their thresholds and expire samples against wall clock rather than only the producer timestamp.


## NEEDS VALIDATION

No source-grounded unresolved record survived independent review.

Complete source evidence, blockers and bounded plans are in [NEEDS-VALIDATION.md](NEEDS-VALIDATION.md). These leads have no severity and are not confirmed vulnerabilities. Owner observations inspect configuration/identity; they do not authorize audit traffic to a deployment.

## Hardening notes and positive source patterns

- deploy/compose/bun.Dockerfile copies all apps/packages, while its Dockerfile-specific ignore uses root .env* rather than an explicit recursive nested-secret exclusion. Narrow release inputs or add recursive exclusions for local env/credential artifacts. No ignored secret was read, no actual credential-bearing nested file was established, and no image disclosure is claimed.
- apply-patch.ts:71-80 resolves BASE_REF in process.cwd() even though workflow writes and subsequent Git calls use PATCH_WORKSPACE=../target. Existing script fixtures use a single checkout, so they do not establish the two-directory workflow behavior. The source-visible effect is a possible safe publication failure, not a demonstrated unauthorized write.
- The documented combined Compose setup also collides on postgres and retains the API profile, command and Dockerfile fields. The unchanged combined run is not established functional. CI validates the two Compose files separately, so it does not settle combined-object behavior. These limitations are retained in the conditional candidate rather than hidden behind a presumed successful deployment.
- The actuator proxy's CONTAINERS=1, POST=1, ALLOW_RESTARTS=1 settings require inspection of the pinned external proxy's effective policy. The repository comment alone does not prove restart-only transport, and docker.sock:ro does not independently prevent write requests over a Unix socket. No arbitrary-operation exploit is claimed without a lower-trust source path.
- Kubernetes RBAC, permissive egress skeleton, Helm values and kind bootstrap are explicitly incomplete and have no workload attachment. Their broad reads or empty egress rule are dormant scaffold/hardening observations, not evidence of a live cluster or internet exposure.
- scripts/kiro/guard-shell.mjs is a substring regex guard, and secret-scan.mjs is post-save and permits unreadable files. They should be described as developer assistance rather than a shell sandbox, full secret prevention control, or publisher boundary. No same-user bypass was elevated to privilege gain.
- Mutable image tags, default local/test database placeholders and public-package metadata were not promoted into vulnerabilities without an actor-controlled handoff and affected lower-trust principal. All checks in this result are source inspection; project code, tests, builds, containers, cloud/GitHub commands, external requests and ignored local settings were not used.
- The guard is a finite literal denylist; even after the event-shape fact is settled, semantically destructive forms (flag reordering, refspec `+`, shell quoting/escaping, namespace flags) are not matched. Parse/normalize the command before matching, and fail closed when the command cannot be identified.
- scripts/kiro/secret-scan.mjs passes an event-supplied path directly to readFileSync with hook-process privileges. Resolve and verify the path against the reported saved file and an allowlisted workspace, even though this path only emits a pattern name, path, and line number rather than file content.
- The command hooks invoke `node`, `bun`, and relative script paths through PATH with an undeclared cwd. Pin the interpreter and resolve paths from the repository root so an unexpected cwd or PATH fails closed instead of silently skipping the control.
- The restricted agents' shell/fs_write denials and `includeMcpJson: false` are declarative configuration. Until Kiro's enforcement is confirmed from vendor source, they should not be treated as a proven containment boundary for source writes near hook configuration.
- Add a source regression spanning an initial awaiting_answer or publication_uncertain reply and its later answer/reconciliation through AuditedWorkCommands. fix.audit.ts:62 keys fix.outcome only by attempt/trigger, while AuditRepo rejects different facts under the same key. The later lifecycle result changes those facts, so review whether nonterminal replies should use a separate transition key or defer the terminal outcome entry. This is a response/audit-lifecycle correctness concern here: pre-effect intent and durable Work transition audit remain present, and no unauthorized effect was established.
- Exercise the actual identity-migration runner with overlapping old numeric IDs, a failure after trigger removal, and retry, rather than proving rollback only by wrapping the extracted SQL block in a test-owned transaction. Keep this as a migration-coverage task until an affected unauthorized principal/resource is established.
- Make DeployRepo.list require an explicit Project selector, or expose an explicit separate privileged enumeration operation. Current Deployment routes always pass a verified route Project, so the optional unfiltered repository form is not a current access-control finding.
- Consider declaring Cache-Control: no-store directly on successful OAuth-token and Credential-issuance responses in apps/api/src/auth/controllers/oauth.controller.ts and credentials.controller.ts. These controllers and configureApp do not set an explicit no-store policy. No unauthorized cache reader or deployed cache behavior was demonstrated, so this is a hardening note rather than a candidate.
- Before adding OAuth-client deletion or grant-downgrade APIs, define whether they cascade to previously issued Credentials. CredentialService.verify currently checks the independent Credential record, and the Credential model has no parent-client foreign key; current public identity routes expose neither transition. If cascading revocation becomes a product guarantee, enforce it at the shared verifier or in the same transaction as the parent change and add a dummy-client regression case. No current cascading guarantee or source-visible violating API transition was established.
- SentryIngestService currently relies on the production Publisher implementation for the full prepareEnvelope privacy contract. Calling the canonical preparation seam explicitly in the service, or expressing that guarantee in the Publisher interface contract, would make this dependency easier to maintain. The current AuthModule -> NATS publisher chain already enforces it, so the narrower local Sentry sensitive-key regex is not reported as a disclosure vulnerability.
- The zero-membership onboarding check is not serialized across concurrent distinct-slug requests. Its source-visible consequence is extra fresh self-owned Organizations, which the normal Organization-creation route already permits, so no security finding is claimed for that race.
- AccountAuthGuard could defensively require a nonempty string sub and a mandatory numeric exp before the repository lookup. The local issuer already creates a string Account id and finite expiration, and no attacker-controlled signed-token issuer or authentication bypass was found for these omitted explicit shape checks.
- Align the resource permission key in apps/api/src/mcp/mcp.permissions.ts:17 with the registered name Autopsy in apps/api/src/mcp/mcp.resources.ts:16. The inspected installed @nestjs/mcp factory passes the registered name to McpScopeGuard, so the current postmortem key fails closed for authenticated resource calls. A positive-scope HTTP resource case should check that behavior; this is an access failure, not a demonstrated security bypass.
- packages/mcp-client/src/reply.ts:48 should compare the single returned resource URI with the requested URI as well as checking text, cardinality and MIME type. Only the caller-selected connection can currently supply that reply, and no separate affected principal or privileged consumer was found, so this remains response-validation hardening.
- The verifier installs time, input and stdout bounds but no explicit per-job CPU, memory, process-count or total-disk quotas. Add such controls to contain arbitrary verification code. This source-only review makes no separate OOM, fork-exhaustion or disk-exhaustion finding without a bounded shared-resource observation and review of outer deployment quotas.
- packages/gateway/src/budget.ts documents per-process post-response counters. If operators require a strict daily spend ceiling across concurrent calls or restarts, reserve bounded call cost atomically and persist accounting. The current documented overshoot/restart ceiling alone was not reported as an unbounded delegated-loop finding.
- packages/agents/src/config.ts exposes allowedTools, but the active gateway adapters supply no callable tools. Keep that distinction explicit in configuration documentation and enforce the field if a callable-tool dispatcher is introduced.
- apps/daemon/src/private-http.ts response deadlines do not cancel durable Work commands; apps/daemon/src/command-lifetime.ts owns and drains that work. Expose or document a separate explicit cancellation operation if callers need to revoke a running attempt. Continued execution after the existing response timeout was not treated as an unrequested action.
- .gitignore:8-17 covers environment variants and local MCP settings but lacks generic private-key, credential-JSON, uploads and alternate local-config patterns. Add narrowly chosen patterns with explicit exceptions for intended fixtures; no committed key file or upload disclosure was established.
- Consolidate apps/api/src/auth/env.schema.ts and apps/api/src/auth/auth.config.module.ts with the root env/config definitions in apps/api/src/config/config.module.ts and apps/api/src/config/env.schema.ts. The old database default and duplicate auth providers make precedence harder to assess, although no request-controlled fallback or default JWT secret was found.
- apps/api/src/auth/services/nats-event-publisher.ts:34-39 reflects connector error.message in a ServiceUnavailableException. Prefer a fixed client-facing broker-unavailable message with separately controlled diagnostics. A populated sensitive connector error was not established, so this is not a disclosure finding.
- Direct API and actuator launchers do not enforce TLS themselves. Preserve the source-visible loopback/private publication model, and specify TLS termination when an operator chooses an off-host public binding. No off-host plaintext credential exposure was established from the supplied defaults.
- Review the stray tracked symlinks packages/agents/agents and packages/core/core, which point outside the repository. They were not followed and no runtime/export consumer was identified; their current presence is a source-hygiene issue rather than a demonstrated boundary violation.
- packages/actuator/src/main.ts:38-41 deliberately uses an acknowledgement-only audit callback and sets durableAudit:false at line 71. Runtime responses correctly remain pending, and the SQLite claim still protects replay, but this is not a durable Project audit handoff. Add a signed Project binding and a real durable audit sink before presenting runtime actions as recorded in a Project audit chain. This is an explicit integration limit, not a demonstrated unauthorized action by itself.
- packages/actuator/src/guards.ts exposes reopened(), but no production caller in the assigned runtime paths feeds incident reopens into it; source tests invoke it manually. When the deferred runtime incident/approval producer is implemented, connect authenticated reopen notifications to this helper and define restart persistence of breaker state. The existing rate and human-approval gates still apply, so this integration gap alone was not promoted as a privilege-boundary finding.
- The checked-in consumer declares max_deliver=5, but processQueued has no delivery-count surface or exhausted-processing DLQ handoff. This is a recovery/operability gap; the configuration does prevent a claim of unlimited broker redelivery for an ordinary permanently failing record.
- The daemon uses one NATS connection for consuming and Collector publication. The checked-in read user lacks detection-publication permission, while the publication user lacks durable-consumer operations. Effective wiring needs a compatible identity or separate connections. This operator-wiring issue alone does not establish an unauthorized action or deployed exposure.
- Docker event buffering has no explicit per-frame byte cap, and Docker/Kubernetes evidence reads primarily limit line counts rather than response bytes. The reviewed origins are operator-selected; no attacker-selected URL or file sink was established. Byte caps and read deadlines would harden these adapters, but upstream runtime limits and a meaningful independent boundary result were not established as a separate finding.
- The legacy exported Docker/Kubernetes watch helpers retain abort listeners after a normal sleep resolves. Production Collectors import the shared integrations watch helper, whose sleep removes those listeners. No active daemon listener-leak finding is promoted from the legacy helpers.

Positive source patterns include bearer-kind separation; pinned JWT algorithm/issuer/audience; current Credential expiry/revocation checks; Project predicates in durable operations; deny-first/default-deny policy; HMAC binding of complete signed objects; immutable base/blob checks; verification receipts; and recovery of uncertain publication before another write. These patterns are source observations, not runtime guarantees.

## Coverage and limits

Ledger: 66 units. blocked: 3; candidate: 24; covered: 39. A candidate unit retains its fingerprint even after its independent record is rejected or left needs_validation; final verdicts are in findings.json. Every source check has an owner and repository-relative paths.

Both coverage critics are preserved in critic-results.json. The post-wave critic returned stop=true with no missing units or reassignments; the distinct final-clean critic independently accepted coverage. Their acceptance concerns declared source coverage only. It does not resolve sandbox, broker, provider, proxy, OS, signing, credential, database or runtime facts outside source.

- blocked: Work item, Deployment, Haunting, Audit, and private durable-state routes / Migration ownership and scope preservation — Establish whether the deployed Prisma migration runner submits the complete identity rewrite as one atomic database unit, including trigger removal/restoration and grant creation, and whether a late failure followed by retry preserves that contract. The SQL file has no explicit transaction boundary and the inspected regression supplies a test-owned transaction. A bounded replay cannot run here because complete memory and cumulative disk sandbox controls are unavailable, target execution is prohibited, and no evidence promotion is permitted.
- blocked: One-shot Actions inputs, dependency/build context and maintained deployment files / Container and cluster capability authority — The effective HTTP method/path policy of tecnativa/docker-socket-proxy:0.3.0 under CONTAINERS=1, POST=1, ALLOW_RESTARTS=1 is outside repository source. External image/source requests and container execution are forbidden, and the complete OS sandbox is unavailable. A trusted owner must inspect that pinned image's policy or perform an isolated dummy-socket allow/deny check for restart versus create/exec/delete before restart-only transport coverage can be completed.
- blocked: Workspace-wide configuration, runtime registration and unexpected fallback surfaces / Literal secret, debug, default and runtime exposure baseline — Obvious 08 remains incomplete: current CVE/GHSA/OSV applicability to the exact bun.lock resolutions and container versions cannot be established from the supplied source. No current offline advisory snapshot is available, external requests are prohibited, and no package-manager audit command may be run. A trusted parent or owner can compare the locked versions with a dated advisory export without executing the project. No vulnerable dependency or severity is asserted.

Kubernetes/Helm/kind are source scaffolds and were not treated as active deployments. The dashboard lives elsewhere. No live configuration, external identity, broker ACL attachment, installed database enforcement, actual GitHub permissions or provider limits were inspected. No prior ledger existed, and one audit pass does not exhaust the target.

## Artifacts

- [findings.json](findings.json): final independently decided records.
- [coverage-ledger.json](coverage-ledger.json): exact units, block maps, source checks and gaps.
- [architecture.md](architecture.md): source-derived architecture and trust boundaries.
- [FINDINGS-DETAIL.md](FINDINGS-DETAIL.md): complete reproduced medium/high/critical findings, if any.
- [NEEDS-VALIDATION.md](NEEDS-VALIDATION.md): exact unresolved source-grounded leads.
- [validation/results/](validation/results): bounded local observed results. [validation/CONTRACT.md](validation/CONTRACT.md), [validation/run-check.sh](validation/run-check.sh) and the numbered harnesses define the reproducible checks and container limits.
- [run-metadata.json](run-metadata.json), [source-manifest.json](source-manifest.json), [source-consistency.json](source-consistency.json), and [run-agent-log.json](run-agent-log.json): run provenance and limits.
