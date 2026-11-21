# API

The API is the only external surface. It owns the MCP Events subscription surface and the audit chain.

## Language

**Event type**:
A named kind of event that a client can watch. It declares an input schema, a payload schema, a Delivery mode and one required scope.

**Subscription**:
The binding of one client to one Event type and its arguments, carried on the poll request. The API holds no session for it.
_Source: `docs/adr/0010-mcp-events-extension-beta.md` and `docs/reports/2026-11-21-mcp-events-bridge.md`._

**Occurrence**:
One Event envelope delivered to a Subscription. It carries an event id, an Event type name, a timestamp and untrusted data.

**Cursor**:
An opaque position in the event stream. A client stores it and sends it back to resume a Subscription.

**Delivery mode**:
A way to deliver Occurrences to a Subscription: poll, push or webhook. Poll is the only mode in v2.

**Watermark**:
The highest stream sequence that a poll has scanned. The service returns it as the Cursor and moves it only over scanned sequences. A Cursor clamped below the retained stream window sets `truncated`.
_Source: `docs/reports/2026-11-21-mcp-events-bridge.md` and `apps/api/src/mcp/events/events.service.ts`._

**Audit chain**:
The ordered, tamper-evident record of decisions.

**Autopsy**:
The postmortem written when a haunting closes.
