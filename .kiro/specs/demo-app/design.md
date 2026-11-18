# Demo App — Design

## Interfaces
- `POST /__haunt {scenario}` — guarded fault control.
- Fault modules live in real source; a runtime flag switches to the buggy path so a fix PR is meaningful.

## Data flow
Haunt token → set scenario flag → traffic hits buggy path → detector signals → incident → draft PR / actuation → reset.

## Error handling
- Invalid scenario → 400. Missing/invalid HAUNT_TOKEN → 401.

## Testing
- Per-scenario integration test asserting the expected detector rule and fix path; reset restores health.
