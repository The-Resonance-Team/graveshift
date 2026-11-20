# Diagnoser + LLM — Design

## Interfaces
- `LlmGateway.run(task, schema, input): LlmResult` — redact input, check budget, call the one configured model, validate schema + evidence, retry once, audit.
- `LlmProvider` — `available()`, `generateObject()`.
- `buildContext(incident): ContextBundle` — enforces size caps.

## Data flow
Incident → redacted, bounded context → gateway → AI SDK model → schema + evidence validator → Diagnosis (or `needs_human`).

## Error handling
- Model timeout/error → transport retry, then rules-only; schema-invalid output → one retry → `needs_human`.
- Prompt content is data inside `<untrusted_*>` tags, never instructions.

## Testing
- Recorded OpenAI-compatible fixture, no network; schema conformance; context-boundary tests; rules-only fallback test.
