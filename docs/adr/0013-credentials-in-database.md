# Credential state and its audit trail live in PostgreSQL

Status: accepted

An earlier design kept Credentials in a file store. On 2026-11-21 the owner chose to keep all durable state in PostgreSQL, including Credentials. The owner removed the file store and its file-based audit log. The credential records and the credential audit events took their place.

The one-way hash of each Credential value stayed in the database. The value itself never entered the database. Names, scopes, tenant scoping, revocation and expiry kept their behavior. The audit trail used the same append-only chain as other decisions. A Credential change and its audit row were written in one transaction.

This decision, ADR 0011 and ADR 0012 superseded the part of ADR 0003 that kept the v1 daemon for reference.

Recheck trigger: The owner reviews this decision when an external store for Credentials or their audit trail is proposed. The owner also reviews this decision when the append-only chain changes.

Rejected alternative: keeping the file store as a fallback.

Trade-off: Credentials needed the database at boot and at request time. The owner kept no file fallback. In return two API instances saw the same Credential state. Revocation took effect everywhere at once.
