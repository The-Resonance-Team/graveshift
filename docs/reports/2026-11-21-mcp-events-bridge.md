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

Sources: `https://modelcontextprotocol.io/seps/3415-events-extension`,
`https://modelcontextprotocol.io/extensions/events/overview`,
`https://github.com/nestjs/mcp/releases` and the installed 2.4.0 and 0.0.4
package files.

## Limits of @nestjs/mcp 0.0.4

| Limit | Needed in v2 | Workaround in this repo | Upgrade path | Named client (source) |
| --- | --- | --- | --- | --- |
| No hook for custom JSON-RPC methods | Yes | Wrap the one `McpServerFactory.create` instance through `McpStdioServer`; register five methods with `setRequestHandler()` | Use a public `onRequest()` or `extensions` hook when `@nestjs/mcp` ships one | `ext-events` client SDK (SEP-3415) |
| No sessions | No | The SDK builds one server per HTTP request; poll carries all state in the cursor | Add sessions only if a client needs server-side leases | none known |
| No runtime tool registration | No | The v2 catalog is static; dynamic event types are v3 | Use a `listChanged` hook when v3 needs dynamic types | none known |
| No multiple MCP servers per app | No | One `/mcp` surface serves tools, prompts, resources and Events | Split servers when a gateway needs several upstreams | none known |
| No request-scoped providers | No | Scope data comes from the request header; no provider holds per-user state | Wait for request-scoped DI in the module | none known |
| No 2024-11-05 HTTP+SSE | No | The 2025-06-18 legacy client still works through the SDK stateless path | Add the old transport only if a client requires it | none known |

No v2 client is blocked by these limits. No linked wayfinder ticket is needed.

## What this change does

- One bridge wraps the factory that both HTTP and stdio entries use. All five
  Events methods are registered on that one server. No second endpoint is
  added. The bridge throws `EventsBridgeError` at boot when the private SDK
  field is gone, so a future bump fails loudly.
- `events/list` returns six static event types. Each type has an `inputSchema`,
  a `payloadSchema`, `delivery: ['poll']` and one required scope from ticket
  47. The capability is advertised with `listChanged: false`. Payload JSON
  Schemas come from Zod shapes in `events.types.ts`, and the same shapes clean
  the returned data. Returned data holds only declared fields with declared
  types.
- `events/poll` takes a Cursor, `maxAgeMs`, `maxEvents` and subscription
  arguments. It scans bounded raw windows until it holds `maxEvents` matches
  or reaches the stream head. The Cursor advances only over scanned
  sequences, so a run of other event types cannot skip a match. It
  deduplicates by `eventId` and returns `truncated`, `hasMore` and
  `nextPollMs`. Payloads are untrusted and go through `deepRedact`.
- `truncated` means that older events were skipped. The service sets it when
  `maxAgeMs` skips an event, or when the source clamps a Cursor below the
  retained stream window. JetStream sequences that are purged or cannot be
  parsed are skipped; they do not stop the poll.
- `events/stream`, `events/subscribe` and `events/unsubscribe` are registered
  as stubs that answer `-32026 Unsupported`. Push and webhook stay v3 work in
  tickets 68, 69 and 70.
- The nine tools, two prompts and one resource template are unchanged.
- Events are registered only for the modern protocol era. A legacy
  2025-06-18 client gets no Events methods and answers `-32601`. stdio has no
  bearer header, so scopes resolve to `[]` and every stdio poll returns
  `-32024 Forbidden`.

## Known gaps

- Static token path is not present on the resolved base branch; #47 wires MCP auth to the shared #63 issuer. No follow-up ticket needed. The one credential component is unchanged and still guards `/mcp`.
- NATS settings live in one events config provider. The stream name has one
  default, in `env.schema.ts` (`GRAVESHIFT_EVENTS`). The read side uses
  `connectNatsReader` from `@graveshift/events/nats`; `apps/api` has no direct
  NATS dependency. No real NATS endpoint is used in tests.
- The bridge uses a runtime field of an SDK class that the package does not
  export. This is marked with a `ponytail:` comment and an upgrade trigger.
  `@nestjs/mcp` stays pinned at exact version `0.0.4`. Three upstream drafts
  in `docs/reports/upstream-nestjs-mcp/` ask for a public hook.

## Recheck trigger

Review this decision when the extension reaches Stable, or when the negotiated
protocol revision changes. If the wire format breaks, keep the Event envelope
model and migrate the subscription surface. Do not fork the MCP SDK.
