# Diagnoser + LLM — Design

## Interfaces
- `LlmGateway.run(task, schema, input): LlmResult` — redact input, check budget, try providers in chain, validate schema + evidence, retry once, audit.
- `LlmProvider` — `available()`, `generateObject()`.
- `buildContext(incident): ContextBundle` — enforces size caps.

## Data flow
Incident → redacted, bounded context → gateway → provider chain → schema + evidence validator → Diagnosis (or `needs_human`).

## Error handling
- Provider timeout/error → next in chain; schema-invalid output → one retry → `needs_human`.
- Prompt content is data inside `<untrusted_*>` tags, never instructions.

## Testing
- Recorded provider fixtures; schema-conformance per adapter; context-boundary tests; rules-only fallback test.
