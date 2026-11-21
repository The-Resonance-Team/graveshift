# Diagnoser + LLM — Design

## Interfaces
- `diagnose({ gateway, agent }, input)` sends the context and selected Agent name to the gateway.
- `Gateway.run(task)` redacts model input, applies budgets, calls the Agent model, validates the result and emits an audit event.
- `buildContext(input)` keeps context within the size limits.

## Data flow
Incident → redacted context → Agent model through the gateway → schema and evidence checks → Diagnosis.

## Error handling
- Transport failures get the configured retries. Schema or evidence failures get one validation retry if budget remains.
- Diagnosis uses rules-only when the model is unavailable, the budget is exhausted or output stays invalid. It returns `needs_human` if the fallback fails.
- The model treats content inside `<untrusted_*>` tags as data.

## Testing
- Replay recorded output through the gateway adapter with a local fetch fake. Check schema, context limits and rules-only fallback.
