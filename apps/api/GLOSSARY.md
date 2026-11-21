# API

The API is the only external surface. It owns the MCP Events subscription surface and the audit chain.

## Events

**Event type**:
A named kind of event that a client can watch. It declares an input schema, a payload schema, a Delivery mode and one required scope.

**Subscription**:
The binding of one client to one Event type and its arguments. The client keeps the list of subscriptions. In v2 the first poll starts one.

**Occurrence**:
One Event envelope delivered to a Subscription. It carries an event id, an Event type name, a timestamp and untrusted data.

**Cursor**:
An opaque position in the event stream. A client stores it and sends it back to resume a Subscription.

**Delivery mode**:
A way to deliver Occurrences to a Subscription: poll, push or webhook. Poll is the only mode in v2.

**Watermark**:
A Cursor at or before which every Occurrence is acknowledged or abandoned. It is safe for the client to persist.

## Decisions

**Audit chain**:
The ordered, tamper-evident record of decisions.

**Autopsy**:
The postmortem written when a Haunting closes.
