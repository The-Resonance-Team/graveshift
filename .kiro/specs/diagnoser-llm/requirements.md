# Diagnoser + LLM — Requirements

## R1 Gateway
- R1.1 WHEN a diagnosis task runs THE SYSTEM SHALL call the selected Agent model through `packages/gateway`.
- R1.2 WHEN the Agent model is unavailable or transport retries fail THE SYSTEM SHALL use a rules-only diagnosis.

## R2 Budget
- R2.1 WHEN the Agent or global UTC daily budget is exhausted THE SYSTEM SHALL use a rules-only diagnosis.

## R3 Context limits
- R3.1 WHEN building a context bundle THE SYSTEM SHALL include at most 300 log lines, 5 files (400 lines each) and 3 recent commits.
- R3.2 External content SHALL be redacted and wrapped in `<untrusted_*>` tags before inclusion.

## R4 Evidence validation
- R4.1 WHEN output fails schema validation or cites an unseen evidence ref THE SYSTEM SHALL retry once if budget remains. WHEN the retry fails THE SYSTEM SHALL use rules-only.
- R4.2 WHEN unsure THE SYSTEM SHALL return category `unknown` with confidence below 0.5.

## R5 Rules-only fallback
- R5.1 WHEN the model is unavailable or its output is invalid THE SYSTEM SHALL produce a deterministic rules-based diagnosis.
- R5.2 WHEN the gateway cannot return a diagnosis THE SYSTEM SHALL return `needs_human`.

## R6 Fixtures
- R6.1 CI SHALL replay recorded responses through the gateway adapter without network access.
