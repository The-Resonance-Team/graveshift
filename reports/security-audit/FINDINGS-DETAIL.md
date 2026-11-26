# Graveshift confirmed finding details

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

