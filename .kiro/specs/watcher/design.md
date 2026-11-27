# Watcher — Design

## Interfaces
- `watcher.ingest(envelope)` returns detection outcomes and Haunting changes.
- Private temporal rules remain separate from the pure Rule override engine.
- Grouping, Salt lines and dedupe include project and Grave identity.

## Data flow
Event envelope → Rule override → temporal detection → Salt line → fingerprint dedupe → Haunting grouping → durable daemon processing.

## Error handling
- PromQL query failure logs a warning and skips that interval; never crashes the loop.

## Testing
- Unit tests per rule with boundary inputs; dedupe-window and grouping tests; silence suppression test.
