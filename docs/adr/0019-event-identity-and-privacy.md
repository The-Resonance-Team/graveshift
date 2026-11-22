# Event identity is nonsecret metadata

Status: accepted

On 2026-11-21 the owner chose to preserve approved Event envelope identifiers, trace relationships and fingerprint equality. Generic text redaction had changed distinct UUIDs into one value. Event identity must stay stable across retries, serialization and MCP occurrence output. Authorized project, Grave and Event type values must also stay stable. Recognized secrets in routing fields are rejected. Untrusted text and payloads, including sensitive payload keys, still pass through privacy processing. The final envelope must pass its canonical validation.

This refines the earlier rule to redact every string. Identity fields have their own validation and privacy rules. They are not a place to carry secrets. Ordinary UUID entropy alone is not a reason to rewrite an identifier. The same policy applies at ingest and Event occurrence output.

Rejected: stable remapping of all identifiers. That would conceal identity but change visible references and require another stable mapping across retries and restarts. The chosen policy preserves the identity contract in ADR 0005 without weakening generic free-text redaction.
