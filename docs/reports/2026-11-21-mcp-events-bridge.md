# MCP Events bridge for v2 (ticket 49)

Date: 2026-11-21. Status: done for v2.

## Goal

Add a local bridge for the Beta MCP Events extension
(`io.modelcontextprotocol/events`) on the one `/mcp` endpoint. Keep NATS
JetStream as the only event backbone. Ship poll delivery only.

## Facts checked against upstream

- `npm view @nestjs/mcp` returns `0.0.4` as `latest`. Release `0.0.4` was
  published on 2026-11-06. It is the latest release.
- `npm view @modelcontextprotocol/server` returns `2.4.0`. Its source serves
  protocol revision `2026-07-28` and supports extension negotiation through
  the `extensions` field of server capabilities.
- `@nestjs/mcp` 0.0.4 has no supported hook for custom JSON-RPC methods. Its
  `McpServerFactory` is not in the package `exports` map. The module exports
  only `McpModule`, `McpHttpService`, `McpStdioServer`, `McpRegistry` and the
  decorators.
- No released SDK implements `events/list`, `events/poll`, `events/stream`,
  `events/subscribe` or `events/unsubscribe`. The 2.4.0 files have no
  `events/` export. `SkillsExtension.attach()` is the only extension pattern
  in the release, and it is marked experimental. No generic `ServerExtension`
  type is exported.
- SEP-3415 is Final. The extension is Beta. It needs protocol revision
  `2026-07-28` or later.

## Limits of @nestjs/mcp 0.0.4

| Limit | Needed in v2 | Workaround in this repo | Upgrade path | Named client affected |
| --- | --- | --- | --- | --- |
| No hook for custom JSON-RPC methods | Yes | Wrap the one `McpServerFactory.create` instance through `McpStdioServer`; register five methods with `setRequestHandler()` | Use a public `onRequest()` or `extensions` hook when `@nestjs/mcp` ships one | `ext-events` client SDK |
| No sessions | No | The SDK builds one server per HTTP request; poll carries all state in the cursor | Add sessions only if a client needs server-side leases | Claude Desktop over stdio |
| No runtime tool registration | No | The v2 catalog is static; dynamic event types are v3 | Use a `listChanged` hook when v3 needs dynamic types | n8n MCP client with plugins |
| No multiple MCP servers per app | No | One `/mcp` surface serves tools, prompts, resources and Events | Split servers when a gateway needs several upstreams | Kong MCP gateway |
| No request-scoped providers | No | Scope data comes from the request header; no provider holds per-user state | Wait for request-scoped DI in the module | OpenAI Agents SDK multi-tenant client |
| No 2024-11-05 HTTP+SSE | No | The 2025-06-18 legacy client still works through the SDK stateless path | Add the old transport only if a client requires it | Cursor with the old SSE transport |

## What this change does

- One bridge wraps the factory that both HTTP and stdio entries use. All five
  Events methods are registered on that one server. No second endpoint is
  added.
- `events/list` returns six static event types. Each type has an `inputSchema`,
  a `payloadSchema`, `delivery: ['poll']` and one required scope from ticket
  47. The capability is advertised with `listChanged: false`.
- `events/poll` takes a Cursor, `maxAgeMs`, `maxEvents` and subscription
  arguments. It deduplicates by `eventId`, bounds replay by JetStream stream
  sequence, and returns `truncated`, `hasMore` and `nextPollMs`. Payloads are
  untrusted and go through `deepRedact`.
- `events/stream`, `events/subscribe` and `events/unsubscribe` are registered
  as stubs that answer `-32026 Unsupported`. Push and webhook stay v3 work in
  tickets 68, 69 and 70.
- The nine tools, two prompts and one resource template are unchanged.

## Known gaps

- The static `GRAVESHIFT_MCP_TOKEN` path named in the ticket is not present on
  base branch `xirothedev/v2-63-credentials`. The one credential component is
  unchanged and still guards `/mcp`.
- The NATS source reads by stream sequence with `jetstreamManager()`. The
  stream name defaults to `GRAVESHIFT_EVENTS` and can be set with
  `GRAVESHIFT_NATS_STREAM`. No real NATS endpoint is used in tests.
- The bridge uses a runtime field of an SDK class that the package does not
  export. This is marked with a `ponytail:` comment and an upgrade trigger.
  Three upstream drafts in `docs/reports/upstream-nestjs-mcp/` ask for a
  public hook.

## Recheck trigger

Review this decision when the extension reaches Stable, or when the negotiated
protocol revision changes. If the wire format breaks, keep the Event envelope
model and migrate the subscription surface. Do not fork the MCP SDK.
