# Credential state and its audit trail live in PostgreSQL

Status: accepted

Ticket #63 built a file-backed Credential repository at mode 0600 with a JSONL audit sink and an explicit "No database service" rule. On 2026-11-21 the owner chose to put all durable state in PostgreSQL, including Credentials. The file store and the JSONL sink are removed; the credential table and the credential audit events take their place. Issue #63 and its open pull request are amended for this change.

The one-way hash of each Credential value stays in the database, never the value itself, as ticket #47 requires. Names, scopes, tenant scoping, revocation and expiry keep their current behavior. The audit trail uses the same append-only chain as other decisions, so a Credential change and its audit row are written in one transaction.

Trade-off: Credentials now need the database at boot and at request time, and the old file store cannot be read as a fallback. In return, two API instances see the same Credential state and revocation takes effect everywhere at once.
