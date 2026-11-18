# Redactor — Requirements

## R1 SEC-4 coverage
- R1.1 WHEN text contains a secret matching a SEC-4 detector THE SYSTEM SHALL replace it with a `[REDACTED:<type>]` marker.
- R1.2 Detectors SHALL cover: env vars, Bearer/Basic auth, JWTs, AWS keys (`AKIA…`), GitHub tokens (`gh[pousr]_…`), Discord tokens, PEM private keys, URLs with passwords, emails, VN phone numbers.
- R1.3 Redaction SHALL occur before every LLM call, log line, audit payload, Discord message and MCP response.

## R2 Entropy
- R2.1 WHEN a token-like string is at least 32 characters with high entropy THE SYSTEM SHALL redact it as `[REDACTED:entropy]`.

## R3 Idempotence
- R3.1 WHEN redact is applied to already-redacted text THE SYSTEM SHALL return identical output (`redact(redact(s)) === redact(s)`).

## R4 Performance
- R4.1 WHEN redacting 1 KB of text THE SYSTEM SHALL complete in under 1 ms.

## R5 Purity
- R5.1 The redactor SHALL be a pure function with no I/O or side effects.
- R5.2 Property tests (§14.2) SHALL prove that an injected secret never appears in output.
