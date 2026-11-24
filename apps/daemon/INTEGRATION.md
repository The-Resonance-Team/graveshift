# Daemon integration

The daemon owns `WorkCommands`. `@graveshift/work` owns all command and state contracts.
The API owns each durable `WorkRuntime` transition at `workPath(id, action)`.
The daemon sends the canonical request schemas and validates the canonical responses.

Private HTTP uses two dedicated internal credentials. The daemon presents `GRAVESHIFT_API_INTERNAL_TOKEN` to the API, which checks it with its InternalGuard. The API presents `GRAVESHIFT_DAEMON_INTERNAL_TOKEN` to the daemon, which checks it in the command and read handlers. The two values must differ. The first granted Project from the credential is a host bootstrap for Collectors only. Work commands take their Project from the command caller, reads from the validated read body, and observations from the Event envelope. A command or read with no granted Project is refused; there is no boot fallback. [ADR 0023](../../docs/adr/0023-organization-is-the-tenant-root.md) sets the model: one deployment serves many Organizations, and project identity comes from the authenticated request or the Event envelope.
The API origin defaults to `http://127.0.0.1:3000`. The daemon listens on loopback port 2602.

The daemon uses these API contracts:

- `GET /internal/config`: `{ projectIds, agents, policy, gateway, natsStream, mode? }`, where `projectIds` is the granted set from the daemon credential and `agents` is
  the resolved `AgentConfig[]`, `policy` is `Policy`, and `gateway` is `GatewayConfig`.
  Keys stay in the environment. Only `apiKeyEnv` names cross this boundary.
- `POST /internal/context`: Work requests send `{ projectId, service, diagnosisRef }`;
  MCP reads send `{ projectId, service, incidentId }`. The response uses
  `SharedPolicyContextSchema` from `@graveshift/core/policy-context`. The counters are real, audited values for
  `openPrsLastHour`, `actionsLast10Min`, `diagnosisLoops`, and `llmSpentTodayUsd`.
  The recorded Haunting Diagnosis and the Work snapshot Diagnosis must agree.
- `POST /internal/audit`: `{ projectId, draft }`, using `AuditDraftSchema`; response `{ key }`.
  The response follows the durable append. Gateway keys use `gateway:<callId>`.
  Model drafts use `type: model.call`, the current Haunting `incidentId`, and
  `payload.service`. The payload also holds the complete Gateway `AuditEvent`.
  Node `AsyncLocalStorage` carries this context without creating another gateway.
  The diagnosis task name is `diagnose`; routing uses `route_work`; patch uses `generate_patch`.
- `POST /internal/hauntings`: `{ projectId, eventId, view }`, where `view` uses
  `RecordedHauntingSchema` from `@graveshift/core/recorded`. The response is the saved
  `RecordedHaunting`. Detection and Diagnosis writes have separate event keys.
  The API upserts by project and incident, and de-duplicates by event key.
- `POST /internal/hauntings/list`: `{ projectId }` returns `RecordedHaunting[]`.
- `POST /internal/hauntings/get`: `{ projectId, id }` returns `RecordedHaunting` or 404.
- `POST /internal/hauntings/context`: `{ projectId, service, diagnosisRef }` returns the
  matching `RecordedHaunting`. The daemon separately loads complete policy facts.
- `POST /internal/work-items/from-haunting`: `{ projectId, eventId, incidentId }`; creates
  one Work item for the diagnosed Haunting, idempotent by project and incident id.
  The canonical `CreatedWorkResultSchema` response is `{ item, created }`.
  Observations await `onWork(item, incidentId)` on new and repeated delivery.
  Production calls `WorkCommands.triage` with actor `wraith`, a stable Haunting command
  id, and `WorkCaller.expectedVersion: 0`. The API atomically rejects a newer assignment.
  A `STATE_CHANGED` result completes activation without replacing that assignment.
  Automatic Agent assignments wait for completion, a saved question, or a saved decline
  before the NATS acknowledgement. Human assignments remain manual.

The concrete fix adapter uses `prepareSource`, `verifyPatch`, `planPublication`, and
`publishVerified` from `@graveshift/fixer`. It reads source at one base SHA, applies and
checks the patch in an isolated directory, then publishes against that verified base.
Preparation returns a publication intent and a publish function. The daemon saves the
intent and required audit before publication. Same-command replay calls
`recoverPublication` for an uncertain intent and records a found draft. It never repeats
an uncertain publication.

Wraith uses `createWatcher().ingest(envelope)` and its returned `WatcherOutcome[]`.
The daemon awaits writes itself; it does not use the optional asynchronous observer.
NATS messages are acknowledged only after all owned durable writes complete.

`@graveshift/events` owns consumer acquisition. `connectEventsConsumer` provisions
one stream and one durable from `GRAVESHIFT_EVENTS_STREAM` and `DETECTION_CONSUMER`,
the same definitions the declarative JSON files are checked against. The daemon
imports no NATS SDK; it supplies only the granted Projects and one process port.
That port receives decoded Event envelopes. An Event whose Project is not granted
is published to that Project's dead-letter subject and is never processed. Scope
for every observation, audit entry and Work caller comes from the Event envelope,
not from the boot bootstrap.

## Private command composition

`createWorkCommands` in `src/work-flow.ts` accepts the shared `WorkRuntime`, Agents,
policy, context resolver, routing model, durable audit writer, executor and recovery port.
`createCommandHandler` in `src/command-handler.ts` turns it into a standard Request handler.
`createPrivateApi` accepts an injected fetch for an in-process HTTP test adapter.
`createWorkClient` uses all canonical `workPath` endpoints and response schemas.
`FixOptions.recover` is required. Production uses `recoverPublication(client, intent)`.
Tests can supply a recorded read that returns a known PR or `undefined`.
The concrete executor accepts an optional `SandboxRunner` for a deterministic integration
test; production leaves it unset and uses the platform sandbox.

`src/platform.database.test.ts` exercises both HTTP hops and the real Work, Haunting,
policy context, and Audit repos in Postgres. It skips unless the existing database fixture
is enabled. Run it with `bun run test:database` from the repo root. That script starts a
throwaway Docker Postgres, applies every migration, and runs the file with the API TypeScript
override that its Nest imports need. Model and GitHub responses are recorded; the sandbox
test runner permits only local Git commands.

The daemon also serves authenticated POST `/internal/read/{services,incidents,incident,logs,metric,counters,context}`.
All inputs include `projectId`, which must be one of the granted Projects. The
incident input adds `id`; context and counters add `incidentId`; logs adds `service`
and `lines`; metric adds `promql`. This is the only daemon read transport: the API's
one named `daemon-read` client presents `GRAVESHIFT_DAEMON_INTERNAL_TOKEN` to it and
fails closed when the daemon is down. There is no separate `/read/*` surface or
second read token. Health stays unauthenticated.

## Daemon environment

The transport setup requires `GRAVESHIFT_API_INTERNAL_TOKEN` and `GRAVESHIFT_DAEMON_INTERNAL_TOKEN`. The boot config supplies the granted Project set; the first entry is a host bootstrap only. [ADR 0023](../../docs/adr/0023-organization-is-the-tenant-root.md) records the scope rule. Optional
settings are `GRAVESHIFT_API_URL`, `GRAVESHIFT_DAEMON_URL`, `GRAVESHIFT_NATS_URL`,
`GRAVESHIFT_COMMAND_TIMEOUT_MS`, `GRAVESHIFT_API_TIMEOUT_MS`, and `GRAVESHIFT_BODY_MAX_BYTES`.
The Events package supplies the one NATS stream and consumer definition; the boot
config's stream name is no longer a second source of truth. Both HTTP origins must use loopback.

Fix execution requires `GRAVESHIFT_GITHUB_APP_ID`, `GRAVESHIFT_GITHUB_PRIVATE_KEY_PEM`,
`GRAVESHIFT_GITHUB_INSTALLATIONS` (JSON mapping repository to installation id), and
`GRAVESHIFT_VERIFY_COMMANDS` (JSON mapping repository to argv command arrays).
`GRAVESHIFT_VERIFY_TIMEOUT_MS` bounds verification; `GRAVESHIFT_DASHBOARD_URL` is optional.

Collectors use optional `GRAVESHIFT_DOCKER_URL`, `GRAVESHIFT_K8S_ENABLED`,
`GRAVESHIFT_K8S_NAMESPACES` (JSON array), `GRAVESHIFT_PROMETHEUS_URL`, and
`GRAVESHIFT_METRIC_TARGETS` (JSON array of `{ service, job }`).
`GRAVESHIFT_COLLECTOR_SERVICE` defaults to `host` for Collector notices.
