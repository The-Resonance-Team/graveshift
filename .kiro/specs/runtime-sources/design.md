# Runtime Sources — Design

## Interfaces
- `RuntimeSource` interface in `packages/core`: `listServices()`, `watchEvents(cb)`, `tailLogs(service, lines)`, `getHealth(service)`, `close()`.
- `packages/sources-docker` and `packages/sources-k8s` implement it.

## Data flow
1. Source emits normalized `RuntimeEvent`s onto the daemon event bus.
2. A shared contract test suite runs against both implementations.
3. Watch loop reconnects with capped exponential backoff and an event cursor.

## Error handling
- Connection loss emits a `source_disconnected` event, then retries; no unhandled rejections.

## Testing
- Contract suite shared by both sources; K8s event-mapping unit tests with fixture events.
