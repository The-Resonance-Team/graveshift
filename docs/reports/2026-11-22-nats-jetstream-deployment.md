# Self-hosted NATS JetStream for v2 (ticket 57)

> Historical record. [ADR 0018](../adr/0018-project-scoped-state.md) supersedes the old `tenantId` text in this report. `projectId` replaces it. [ADR 0023](../adr/0023-organization-is-the-tenant-root.md) supersedes the one-project scope statements below: one deployment serves many Organizations, and each Organization owns its Projects directly.

Date: 2026-11-22. Status: proposed for v2. Research only. No code changed.

## Goal

Define the self-hosted NATS JetStream deployment for platform v2.
Name the deployment shape, the subject tree, the stream limits, and the ack rules.
State how Collectors and Plugins reach the stream.
State the auth for each hop and the ports that stay private.
Keep one rule engine for envelopes.

## Base and sources

Base branch: `feat/platform-v2` at commit `0580ffc`. This is the head of the active stack.
I resolved the head at the start of the task. I did not hard-code a branch.

Docs read: `docs/adr/0005-event-backbone-nats.md`,
`docs/adr/0012-postgresql-durable-store.md`, `GLOSSARY.md`, `GLOSSARY-MAP.md`,
`docs/ARCHITECTURE.md` and `docs/reports/2026-11-21-mcp-events-bridge.md`.

Code read: `packages/core/src/schemas.ts`, `packages/core/src/rules.ts`,
`packages/events/src/index.ts`, `packages/events/src/nats.ts`,
`packages/watcher/src/rules.ts`, `apps/api/src/auth/controllers/events.controller.ts`,
`apps/api/src/auth/services/event-ingest.service.ts`,
`apps/api/src/auth/services/nats-event-publisher.ts`,
`apps/api/src/mcp/events/events.config.ts`, `apps/api/src/mcp/events/events.source.ts`,
`apps/api/src/auth/env.schema.ts` and `.env.example`.

NATS primary sources: `docs.nats.io` pages for JetStream, JetStream in a cluster,
Backup and Recovery, Stream backup and restore, and Rolling upgrades (server 2.15 docs).
No daemon, no network call to our services and no real secret is used in tests or CI.

## Deployment shape

### Storage

Use file storage on a persistent volume. JetStream writes the stream to `store_dir`.
File storage keeps the stream across a restart. File storage is also needed for a
stream snapshot on server versions before 2.15. Do not use memory storage for the
event stream.
Set `max_payload` at or above the largest envelope. The API caps an envelope at
`GRAVESHIFT_EVENT_MAX_BYTES` (default 65,536 bytes). A server limit of 128 KiB leaves
room for the JSON form.

### Single node first, cluster later

v2 used one NATS server with one replica (R1). At that time one project used the platform.
One server was enough for the load. One server had no quorum problem and no extra
cluster port to protect.

The upgrade path to high availability is a JetStream cluster of three or five servers.
Use an odd number. A majority needs more than half of the group. Three servers keep
a stream available when one server fails. Set the stream to R3 when the cluster is
three servers. R1 on a cluster is still one copy; it is not high availability.
Put the servers in different failure domains. R3 copies in one rack do not protect
against one rack failure.

A mirror at a second site is disaster recovery, not a backup. Mirrors stay out of v2.
A snapshot is the backup path. Replication keeps data available; it does not undo a
bad write.

### Backup path

Use a stream snapshot for `GRAVESHIFT_EVENTS`.

1. Take a dated snapshot to off-site storage:
   `nats backup stream GRAVESHIFT_EVENTS ./backups/graveshift-events/<date> --consumers`.
   Keep the consumer state. Older CLI versions use `nats stream backup`.
2. Copy the directory off the host. A snapshot beside the live store does not survive
   a disk loss.
3. Check the backup on NATS 2.15 and later with
   `nats backup validate <dir>` and `nats backup info <dir> --subjects`.
4. Restore only when the stream is gone. Run
   `nats backup restore stream <dir>`. The stream name comes from `backup.json`;
   restore does not rename a stream.
5. Verify with `nats stream info GRAVESHIFT_EVENTS`. Match the message count and the
   last sequence against the snapshot.

Set a daily snapshot and keep seven days of snapshots. Encrypt the off-site copy.
Do not put a credential in the snapshot directory. Back up the server config and the
NATS auth material separately, in an encrypted secret store. A snapshot without the
auth material is data that nobody can read.
The PostgreSQL database holds work items, the audit chain and Credentials under
ADR 0012. The NATS snapshot is for Event occurrences and Cursors. It is not the
backup for those PostgreSQL rows.

### Upgrade path

- Single node: take a snapshot first. Stop the server gracefully and let JetStream
  flush to disk. Replace the binary or the image. Keep the same `store_dir`. Start
  the server. Check `nats stream info GRAVESHIFT_EVENTS`.
- Cluster: roll one node at a time. Put a node in lame-duck mode with `SIGUSR2`, or
  use the chart `preStop` hook. Transfer leadership before the process stops. Upgrade
  the non-leaders first and the meta-leader last. Check that each replica reads
  `current` before you move to the next node. Use a PodDisruptionBudget with
  `minAvailable: 2` on Kubernetes.
- Pin the NATS server version and the official client package versions. Test the
  upgrade in staging. Read the release notes before a version change. Keep the
  `store_dir` during an upgrade; do not replace the volume.

## Subject tree

The current `publishSubject` in `packages/events` builds
`graveshift.<projectId>.<lane>.<type>`. The `service` value names the Grave, but it
is not in the subject. The v2 target adds the Grave token:

```text
graveshift.<projectId>.<lane>.<grave>.<type>
```

- `projectId` — one token. The v2 record assumed one project at that time; the
  token was meant to keep v3 ready without a rewrite.
- `lane` — `telemetry` or `detection`. `laneFor` maps `info` to `telemetry` and
  `warning` or `critical` to `detection`.
- `grave` — the service under watch. It must be one safe token: `^[A-Za-z0-9_-]+$`.
  A service name with other characters must be mapped to a safe token before use.
- `type` — the event type. It may span several tokens. Each token must be
  `^[A-Za-z0-9_-]+$`.

Examples:

```text
graveshift.acme.telemetry.checkout.http.request
graveshift.acme.detection.checkout.runtime.restart-loop
```

The change from the current form is one function in `packages/events`. It is part of
the implementation work listed at the end of this report. The stream filter
`graveshift.>` does not change. Per-Grave consumers can filter on
`graveshift.*.detection.<grave>.>`.

## Streams, retention and limits

v2 uses one stream. Two lanes are subject prefixes in that one stream, not two
streams. One stream keeps one cursor space, one read path and one snapshot. Split the
stream by lane only if telemetry volume forces a different retention window.

| Setting | v2 value | Reason |
| --- | --- | --- |
| Name | `GRAVESHIFT_EVENTS` | The default in `env.schema.ts`. |
| Subjects | `graveshift.>` | Matches both lanes and all projects. |
| Storage | file | Restart safety and snapshots. |
| Retention | limits | An event log with more than one reader. |
| Discard | old | Bound age and size. |
| Replicas | 1 on one server; 3 on a three-server cluster | R1 is the v2 default. |
| Max age | 30 days | Cursors and autopsies need a long window. |
| Max messages | 5,000,000 | A count guard for a busy service. |
| Max bytes | 10 GiB | Sets the volume size. |
| Max message size | 128 KiB | The API bound is 64 KiB; this leaves room. |
| Duplicate window | 2 minutes | Matches the current default in the code. |

The 30-day age limit must stay longer than the longest MCP Cursor lifetime. A Cursor
below the retained window is clamped and the poll reports `truncated`. A short window
would lose Occurrences that a client still wants to poll.

Proposed consumer for the detection lane (the daemon wiring is not built yet):

| Setting | v2 value |
| --- | --- |
| Durable name | `graveshift-watcher` |
| Filter | `graveshift.*.detection.>` |
| Delivery | explicit ack |
| Ack wait | 30 seconds |
| Max deliver | 5 |
| Backoff | 1 s, 5 s, 30 s |
| Start | all retained messages; idempotency makes a replay safe |

Telemetry is read by sequence through the API Events source. It needs no separate
consumer in v2.

### Acknowledgement and retry rules

- The publisher must wait for the JetStream publish ack. The API returns 202 only
  after the ack. A failed publish returns 503 and the client may retry.
- `createNatsPublisher` sends the envelope `id` as `msgID`. JetStream drops a repeat
  publish of that id inside `duplicate_window`.
- Delivery is at least once. A repeat after the duplicate window is possible. Every
  consumer must deduplicate on envelope `id`. The rule engine and the Wraith must
  not assume exactly-once delivery.
- A consumer sends an explicit ack only after it stores the result of the event.
  On a transient error it nacks with a delay. JetStream redelivers until
  `max_deliver`. After the last delivery the consumer publishes the envelope to
  `graveshift.<projectId>.dlq.<grave>` and acks it. No message loops forever.
- The HTTP publisher in a Plugin or Collector retries on 429, 503 and a connection
  error. It sends the same envelope `id` on each retry. The API deduplicates by that
  id and by the JetStream `msgID`.
- The Events read side fetches up to 16 sequences at a time. A read error propagates,
  so the client retries with the same Cursor. A bad payload is skipped, not fatal.

## Ingest path: Collectors and Plugins

In v2 each Collector and each Plugin sends its envelope through the API ingest route.
Both use `POST /api/events` with a plugin key. The route is the one write boundary
for integration input.

1. The integration builds one `EventEnvelope` with `EventEnvelopeSchema` from
   `packages/core`. The `id` is the idempotency key. `projectId` and `service` name
   the project and the Grave.
2. It uses `createHttpPublisher` from `packages/events` and sends a bearer plugin key.
   It imports no NATS client and holds no NATS credential. A Collector uses the same
   route as a Plugin. Daemon-side placement does not grant a direct NATS write.
3. The API applies `PayloadSizeInterceptor`, `ThrottlerGuard` and `PluginApiKeyGuard`.
   The `class-validator` DTO rejects unknown fields with 422.
4. `EventIngestService` checks the `events:publish` scope, the project binding and the
   optional service binding. It parses the envelope again with the core schema,
   redacts every string, and calls the injected `Publisher`.
5. `NatsEventPublisher` is the one production publisher in the API. It publishes to
   `GRAVESHIFT_EVENTS` on the subject built above. It returns 202 after the ack.
6. The daemon consumes detection envelopes. Wraith groups signals into incidents.
   The Events read side serves MCP poll requests from the same stream.

The direct NATS publisher in `packages/events` stays for daemon-internal use. v2 does
not use it for Collector or Plugin input. The `Publisher` seam keeps this testable
with the in-memory fake.

### One rule engine

There is one rule engine for envelopes. `evaluateEnvelope` in `packages/core` is that
engine. It reads system rules, merges client rules by id, and reports Rule overrides.
`detectRuleOverrides` returns the warning; `POST /api/rules/validate` needs explicit
confirmation before a save. The engine is pure: it calls no model and writes no data.

`packages/watcher` (Wraith) detects patterns from runtime signals: error bursts,
restart loops, OOM, failed health checks and metric thresholds. This is signal
pattern detection, not envelope rule evaluation. Wraith does not call the envelope
engine and does not hold a second copy of it.

No Plugin, no Collector and no API route evaluates a rule. Do not add envelope rule
evaluation or Wraith pattern detection to those places. Do not create a second copy
of detection logic. If a new signal pattern is needed, add it to `packages/watcher`;
if a new envelope action is needed, add it to the one engine in `packages/core`.

## Auth and secrets for each hop

No secret is in YAML, in the repo, in a log or in a snapshot. Keys come from the
process environment or a Kubernetes Secret. Credentials in PostgreSQL are SHA-256
hashes with a short display prefix. Presented values are compared in constant time.
The value of a new Credential is shown once.

| Hop | Credential | Where it comes from | Transport |
| --- | --- | --- | --- |
| Plugin -> `POST /api/events` | Plugin key, scope `events:publish`, project binding, optional service (Grave) binding | Issued by `POST /api/credentials`; kept as a hash in PostgreSQL; held in the host secret store | HTTPS at the API ingress |
| Collector -> `POST /api/events` | Same plugin key shape, one key per Collector | Same issuer and store | HTTPS at the API ingress |
| API -> NATS, publish | NATS user or NKey with publish on `graveshift.>` | `GRAVESHIFT_NATS_URL` from env or Secret; auth material in the NATS server config | TLS on a private network |
| Daemon / Wraith -> NATS, consume | A second user with subscribe and ack on `graveshift.>`, no publish | Env or Secret | TLS on a private network |
| API Events read side -> NATS | A read-only user: `streams.info` and `getMessage` on `GRAVESHIFT_EVENTS`, no publish | Env or Secret | TLS on a private network |
| NATS server -> NATS server, cluster route | Cluster user and TLS cert | Secret store; TLS material mounted | TLS on the private cluster port |
| Client -> `POST /mcp` | MCP read token (`kind: mcp`) with a declared scope | `POST /api/credentials`; OAuth 2.1 client credentials at `POST /api/oauth/token` | HTTPS; bearer token |
| Operator -> NATS CLI, backup | Operator or admin NKey creds | Secret store; not in the repo or the snapshot | TLS on a private network |

`GRAVESHIFT_OAUTH_JWT_SECRET` must be at least 32 characters and must not be a
placeholder. The API fails at boot when it is absent. One credential component in
`apps/api/src/auth` issues and verifies both plugin keys and MCP tokens. Do not add
a second issuer or verifier.

## Ports

| Port | Service | Exposure in v2 |
| --- | --- | --- |
| 3000 | API (`/api/events`, `/mcp`, health, OpenAPI) | The only external port. Put it behind a TLS ingress. Default bind is 127.0.0.1. |
| 4222 | NATS client | Private only. No public ingress. Use TLS. |
| 6222 | NATS cluster route | Private only. Use TLS. Not used on a single node. |
| 8222 | NATS HTTP monitoring | Bind to localhost or a private interface. Never expose to the internet. |
| 7422 | NATS leafnode | Disabled in v2. |
| 7777 | NATS WebSocket | Disabled in v2. |
| 1883 | NATS MQTT | Disabled in v2. See below. |
| 2602 | Daemon local surface | Localhost only. No client calls the daemon. |
| 2603 | Actuator | Not published. |
| 5436 | PostgreSQL | Private only. |

## Out of scope in v2

- **MQTT is out of v2.** No named v2 client speaks MQTT. NATS JetStream is the single
  envelope lane and it is self-hosted. Do not enable the NATS MQTT port. Do not build
  an MQTT bridge or gateway. A named client may raise MQTT in v3.
- **No daemon runs in GitHub Actions.** Actions runs one-shot jobs only: patch and
  open-pr. It validates a signed policy decision and opens a draft PR. It opens no
  NATS connection, starts no long-running server and holds no model key. Backups and
  upgrades run on the self-hosted platform, not in Actions.
- Clustering, mirrors and a multi-Organization scope were not v2 work. The subject
  and the envelope keep the project so a later scope change needs no rewrite.

## Implementation work proposed

This research changes no code. The linked implementation issue covers:

1. Add the Grave token to `publishSubject` and map service names to safe subject
   tokens.
2. Add the stream and consumer definitions with the limits in this report. Keep one
   stream name in one config place.
3. Add the durable consumer and the dead-letter subject for detection envelopes.
4. Add a backup and restore runbook and a restore check. Keep secrets out of the
   backup.
5. Add the NATS server config: file store, TLS, separate publish/read users, private
   bind and disabled MQTT, leafnode and WebSocket ports.

## Recheck triggers

Review this report before the first production envelope is written, when a second
console-created Project is added, when one server reaches its age or size limit,
or when a named client needs a delivery mode other than poll. Recheck the backup
format when the NATS server version changes.
