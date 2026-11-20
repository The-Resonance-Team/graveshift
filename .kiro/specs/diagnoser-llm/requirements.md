# Diagnoser + LLM — Requirements

## R1 Gateway
- R1.1 WHEN a diagnosis task is run THE SYSTEM SHALL call LLM providers only through `LlmGateway`.
- R1.2 THE SYSTEM SHALL use one configured AI SDK model (`openai-compatible`); WHEN it is unavailable (no `OPENAI_COMPATIBLE_API_KEY` or a placeholder model) or its call fails after retries THE SYSTEM SHALL fall back to rules-only.

## R2 Budget
- R2.1 WHEN the token budget is exhausted THE SYSTEM SHALL stop calling the model and use rules-only.

## R3 Context limits
- R3.1 WHEN building a context bundle THE SYSTEM SHALL include at most 300 log lines, 5 files (400 lines each) and 3 recent commits.
- R3.2 External content SHALL be redacted and wrapped in `<untrusted_*>` tags before inclusion.

## R4 Evidence validation
- R4.1 WHEN output fails schema validation or cites an unseen evidence ref THE SYSTEM SHALL retry once, then return `needs_human`.
- R4.2 WHEN unsure THE SYSTEM SHALL return category `unknown` with confidence below 0.5.

## R5 Rules-only fallback
- R5.1 WHEN the model is unavailable or its output is invalid THE SYSTEM SHALL produce a deterministic rules-based diagnosis.

## R6 Fixtures
- R6.1 CI SHALL use recorded LLM fixtures only, with a schema-conformance test for the provider.
