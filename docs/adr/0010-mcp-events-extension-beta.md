# MCP Events at Beta on one endpoint

Status: accepted

On 2026-11-21 the owner chose the official MCP Events extension for v2 while it was at Beta. The Events specification had reached Final. Final means the specification is stable. The extension was at Beta. Beta means the extension can still change. The design needed a newer protocol revision than the older client in ADR 0006.

The API exposed one subscription surface. Crew agents and external client agents used it. The API mapped each envelope to an Event occurrence, mapped the stream position to a Cursor, and checked the scope that the Event type declared. Poll was the only delivery mode in v2. The owner left push and webhook delivery for v3.

This decision amends the note in ADR 0006 about runtime registration. ADR 0006 said that the MCP module had no runtime tool registration. The owner accepted a local addition for Events until upstream support existed. The rule of one endpoint from ADR 0006 stayed. The compatibility test in ADR 0006 for the older client stayed. That test and the newer protocol revision for Events did not conflict.

Recheck trigger: The owner reviews this decision when the extension reaches Stable. The owner also reviews this decision when the protocol revision for Events changes. If the wire format changes, the owner keeps the Event envelope model and moves the subscription surface.

Rejected alternative: forking the MCP SDK.

Trade-off: The team gained a standard subscription contract and cursor semantics at once. The team accepted a local addition and a wire format that could still change.
