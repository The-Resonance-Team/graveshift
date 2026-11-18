# Watcher — Design

## Interfaces
- `DetectorRule = { id, evaluate(signals, metrics): Signal[] }`.
- `fingerprint(signal): string` — stable 10-minute dedupe key.
- `groupSignals(service, signals): Incident`.

## Data flow
RuntimeEvent / metric sample → deterministic rules → fingerprint dedupe → group by service → incident with severity → silence filter → event bus.

## Error handling
- PromQL query failure logs a warning and skips that interval; never crashes the loop.

## Testing
- Unit tests per rule with boundary inputs; dedupe-window and grouping tests; silence suppression test.
