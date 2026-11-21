# PostgreSQL is the durable store

Status: accepted

On 2026-11-21 the owner chose PostgreSQL as the single durable store for platform v2. The owner moved work items, the audit chain and Credentials into it. Event occurrences and Cursors stayed in the event backbone from ADR 0005. The owner kept derived caches in memory. Config stayed in YAML under ADR 0011. The owner replaced the file-backed and process-lifetime stores.
A restart could no longer lose state.
Two API instances could no longer hold different copies of it.

The API owned the schema and the migrations.
The team used an ORM-based schema and migration tool.
The owner moved the append-only audit chain into the API. ADR 0009 already removed the v1 daemon.
This decision, ADR 0011 and ADR 0013 superseded the remaining part of ADR 0003 that kept the v1 daemon for reference. The owner removed the old store with the v1 daemon. Every stored row carried the tenant value for v3. Work item transitions prevented two requests from claiming the same item.

No production data existed in v2. The owner made the cutover in one change. The owner kept no dual-write and no backfill. No secret or connection string entered the repo.

Recheck trigger: The owner reviews this decision before the first production data is written.
The owner also reviews this decision when a second durable-store requirement appears, or when a scale or availability limit exceeds one PostgreSQL instance.

Rejected alternative: keeping the file-backed store as a fallback.

Trade-off: PostgreSQL added one service.
The schema was tied to one migration tool.
In return the team had one durable store, restart safety and one place for migrations.
