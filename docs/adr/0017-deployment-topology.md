# Deployment topology and the daemon link

Status: accepted

> [ADR 0018](0018-project-scoped-state.md) supersedes the `tenantId` clause here. `projectId` replaces it.

Date: 2026-11-22.

Part of #18. This decision unblocks #48. It fixes process placement and the
local link. Ticket #57 defines the NATS stream design and the retention rules.
Numbering note: ADR 0015 is the config decision on the unmerged `xirothedev/autofix-config-v2` branch; ADR 0016 is reserved for ticket #59.

## Context

ADR 0006 names the NestJS API as the only external surface. The daemon keeps
health and a local command inbox. No client calls the daemon. ADR 0005 puts all
input through NATS JetStream in one envelope. ADR 0012 puts durable state in
PostgreSQL. The code today matches these rules: the daemon serves only
`GET /healthz` on `127.0.0.1:2602`, and the API serves `GET /healthz` and `/mcp`
on `127.0.0.1:3000` by default.

The MCP backend in `apps/api/src/mcp/mcp.backend.ts` returns empty results.
Ticket #48 must replace it with a client of a read surface. ADR 0006 does not
say how the API reaches daemon state. This ADR makes that choice.

Self-hosting is the recommended shape for v2. GitHub Actions runs one-shot jobs
only. No daemon runs in Actions.

## Decision

The daemon and the API use HTTP with JSON over the loopback network interface.
This is the **daemon-to-API link**. The daemon is the server. The API is the
client. Reads go from the API to the daemon. The daemon serves `GET /healthz`
and a small read API on the same loopback port. The API polls `GET /healthz` for
liveness and calls the read API for MCP tool reads. The MCP backend becomes one
typed HTTP client of that surface. Tests inject a fake client. No test opens a
network connection or starts a daemon.

The daemon keeps its localhost bind. The read API is not published. The API
stays the only external surface.

## Topology

- Self-hosted is the recommended shape. One host or one pod runs the API, the
  daemon, NATS JetStream and PostgreSQL. Compose is the supported local shape.
  The current compose file runs support services but starts neither the API nor
  the daemon. That wiring is implementation work.
- NATS JetStream is self-hosted. It stays the one envelope lane. Ticket #57
  defines its deployment shape, stream, subjects and retention.
- The API owns the schema and the migrations in PostgreSQL (ADR 0012). The
  daemon owns the rule engine and the in-memory incident state (ADR 0005).
- Kubernetes mode is a skeleton and is not built (issue #14). Do not depend on
  it for v2.
- No daemon runs in GitHub Actions. Actions runs the `patch` and `open-pr`
  one-shot jobs. No server, no merge and no runtime action run there.
- One tenant per deployment in v2. The `tenantId` field stays in the envelope
  for v3.

## Network boundary and auth for each hop

| Hop | Network boundary | Auth |
| --- | --- | --- |
| Client to API `/mcp` (Streamable HTTP) | The only external surface. Bind `127.0.0.1:3000` by default. Put TLS at the ingress when the route is exposed. | Bearer MCP read token issued by `POST /api/credentials` with kind `mcp`. `CredentialService.verify(token, 'mcp')` checks it. A scope floor checks every MCP method. The stdio launcher has no auth by design. |
| API to daemon read API | Loopback only on `127.0.0.1:2602`. Do not publish the port. No client calls the daemon. | A deployment-local read token is set in the env of both services. It has no default and both services fail closed when it is missing. The API sends it as `Authorization: Bearer`. |
| API to daemon `/healthz` | Loopback only on the same port. | No token. This route returns liveness only and carries no data. |
| Plugin or Collector to API `/api/events` | External HTTP surface on the API. Clients hold no NATS credentials. | Bearer plugin publish key with scope `events:publish`. The route checks the tenant and the service binding, bounds bytes and rate, redacts strings, then returns 202. |
| API to NATS JetStream | Private network. Client port 4222 is not published. | NATS credentials are held only by the API and come from the env or a secret store. No credential value is in the repo. |
| API to PostgreSQL | Private network. In compose the port is bound to loopback. | Database credentials come from the env or a secret store. No value is in the repo. |
| Fix path: MCP `fix:propose` to policy to Actions to GitHub | The platform calls one-shot Actions jobs. No daemon is in Actions. Graveshift opens a draft PR only. No merge and no runtime action. | The platform signs the policy decision with HMAC-SHA256. The key is at least 32 bytes and the window is at most five minutes. Both jobs verify it with trusted policy. The `patch` job uses a read-only `GITHUB_TOKEN`. Only the `open-pr` job uses a narrow, repository-scoped `pr_token`. Both jobs check the base-ref allowlist and the trusted workflow SHA. |
| Platform to actuator (future action) | Internal network `act`. Port 2603 is not published. This hop is not part of the v2 fix path. | One HMAC-signed, single-use action. The secret is at least 32 characters. |

## Alternatives rejected

- **NATS request and reply.** ADR 0005 gives NATS one role: at-least-once
  envelope delivery on two lanes. Request and reply would add a synchronous
  role, a second copy of state and a broker dependency for reads and health.
  Health must not depend on the broker.
- **gRPC.** It adds a dependency and a code generation step without a need that
  loopback HTTP does not meet.
- **Unix domain socket.** It gives no gain over loopback HTTP in the self-hosted
  shape and is harder to mount in containers.
- **Reads straight from PostgreSQL.** Some audit state lives in the API store,
  but the MCP backend must read daemon-owned state such as incidents, logs,
  metrics and counters. A direct database read would also bypass the daemon.
  This may change when that state moves into the store.

## Consequences

- The API depends on a live daemon for MCP reads. When the daemon is down, the
  API returns an unavailable result and fails closed. It does not invent data.
- New config is needed: the daemon read token, the API client base address and
  the API client token. No value is written to the repo.
- `GET /healthz` stays a plain loopback probe. No broker is needed for liveness.
- The API stays the only external surface. No client gains a route to the
  daemon.

## Recheck trigger

Review this decision when the daemon read API moves into the durable store,
when v3 needs a remote link or more than one tenant, or when Kubernetes mode is
built. Review it before any daemon is placed in GitHub Actions.
