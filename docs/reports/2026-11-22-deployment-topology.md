# Deployment topology and the daemon link (ticket #61)

Date: 2026-11-22. Status: done for v2.

Base branch: `feat/platform-v2` at `0580ffc`, the head of the active stack at
the start of this task.

## Goal

Choose how the daemon, the API and NATS run in v2. Choose the link that the MCP
backend uses for reads and health. State the network boundary and auth for each
hop. Unblock #48.

## Evidence checked

- #61 (research), #18 (map), #48 (MCP backend), #57 (NATS operations), #59
  (reserved ADR 0016).
- ADR 0005, ADR 0006, ADR 0012, `GLOSSARY.md` and `docs/ARCHITECTURE.md` on
  `feat/platform-v2`.
- Current code on that branch: `apps/daemon/src/routes.ts` serves only
  `GET /healthz` on `127.0.0.1:2602`. `apps/api/src/mcp/mcp.backend.ts` returns
  empty results. `apps/api/src/mcp/mcp.types.ts` defines the seven reads that
  MCP needs. `deploy/compose/graveshift.compose.yml` runs support services and
  no daemon. ADR 0015 exists only on the unmerged
  `xirothedev/autofix-config-v2` branch. ADR 0016 is reserved for ticket #59.
  ADR 0017 is this decision.

## Result

**Transport: HTTP with JSON over the loopback interface.** The daemon is the
server. The API is the client. Reads go from the API to the daemon. The daemon
serves `GET /healthz` and a small read API on `127.0.0.1:2602`. The MCP backend
in `apps/api/src/mcp/mcp.backend.ts` becomes one typed HTTP client of that
surface. Tests inject a fake. No test uses a network or a daemon.

Self-hosting is the recommended shape. One host or one pod runs the API, the
daemon, NATS JetStream and PostgreSQL. Compose is the supported local shape.
Kubernetes mode is not built. No daemon runs in GitHub Actions. Actions runs
one-shot `patch` and `open-pr` jobs only.

| Hop | Boundary | Auth |
| --- | --- | --- |
| Client to API `/mcp` | Only external surface; TLS at the ingress | Bearer MCP token, `CredentialService.verify(token, 'mcp')`, scope floor per method |
| API to daemon read API | Loopback `127.0.0.1:2602`, not published | Deployment-local read token in env, no default, fail closed |
| API to daemon `/healthz` | Loopback only | None; liveness data only |
| Plugin or Collector to API `/api/events` | API HTTP surface | Publish key, scope `events:publish`, tenant and service checks |
| API to NATS JetStream | Private network, port 4222 private | NATS credentials held by the API only |
| API to PostgreSQL | Private network, loopback bind in compose | DB credentials from env or secret store |
| Fix path to Actions to GitHub | One-shot jobs, no daemon, draft PR only | HMAC-signed decision, 32-byte key, five-minute window, narrow `pr_token`, trusted SHA, base-ref allowlist |
| Platform to actuator (future) | Internal network `act`, port 2603 private | HMAC-signed single-use action |

Alternatives rejected: NATS request and reply, gRPC, a Unix socket and direct
reads from PostgreSQL. The reasons are in ADR 0017.

## Implementation coverage

This is research only. No running code changed. #48 owns the API-side client
and the real counters. #57 owns the self-hosted NATS shape. The daemon read
endpoints, the deployment-local read token and the compose wiring to run the
API and the daemon are residual work. I created **no new issue**. The proposal
is to track that residual work inside #48, unless the coordinator wants a
separate child of #18.

No ADR number was reused. ADR 0017 is the only ADR created.

## Recheck trigger

Review the decision when the read API moves into the durable store, when v3
needs a remote link or more than one tenant, or when Kubernetes mode is built.
