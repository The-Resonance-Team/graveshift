# Adopt the MCP Events extension at Beta

Status: accepted

On 2026-11-21 the owner chose to use the official MCP Events extension (`io.modelcontextprotocol/events`) in v2 while it is at Beta. SEP-3415 is Final and the extension is in Beta. It needs protocol revision `2026-07-28` or later.

Graveshift exposes one subscription surface in `apps/api`. Crew agents and external client agents use that surface with a #63 credential and #47 scopes. NATS JetStream stays the only event backbone. The API maps each envelope to an Event occurrence, maps the stream position to a Cursor, and checks the scope that the Event type declares. Poll (`events/poll`) is the only delivery mode in v2. Push (`events/stream`) and webhook (`events/subscribe`) are v3 work in tickets #68, #69 and #70.

`@nestjs/mcp` 0.0.4 serves protocol revision `2026-07-28` through `@modelcontextprotocol/server` 2.4.0, so extension negotiation works at the wire level. The module has no supported hook for custom JSON-RPC methods. Ticket #49 owns the local patch or adapter that registers the `events/*` methods on the single `/mcp` endpoint. No second MCP endpoint is allowed. No released SDK version implements Events; the `ServerExtension` API is on an unreleased branch only.

Recheck trigger: when the extension reaches Stable, or when the negotiated protocol revision changes, review this decision. If the wire format breaks, keep the Event envelope model and migrate the subscription surface. Do not fork the MCP SDK. Keep upstream gaps in the local drafts of #49 and in the v3 wire ticket #68.

Trade-off: we gain a standard subscription contract and cursor semantics now, but we carry a local bridge and a Beta wire format until upstream support is released.
