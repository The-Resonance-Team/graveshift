# Bounded, Project-scoped caches

Status: accepted

On 2026-11-27 the owner decided how derived in-memory state is held in Graveshift. A Project is the scope of every row, Event and Credential (ADR 0018). A cache key that omits the Project, or a cache without a size, age and terminal-failure bound, can therefore cross a trust boundary or grow without limit. The daemon pending-outcome map is bounded by entry count and age and drops permanently failed outcomes. The daemon service-id map, the watcher group cache and the Event dedupe set key on the Project; the dedupe set keeps its 100k FIFO bound. The process-local API credential key index is removed, and the client id used for throttling comes from the verified principal.

Application test doubles that stand in for our own Postgres repos, audit sink or MCP backend are replaced by the real adapters; the failing scenarios are expressed with real constraints. Fakes that stand in for third-party services (NATS, MCP SDK transports, Docker, Kubernetes, GitHub) stay: those services own their in-memory behavior and no local broker or provider harness exists. The committed security-audit artifacts stay byte-identical as evidence.

Considered options: moving derived caches into PostgreSQL was rejected because it turns every Event into a write transaction; keeping unbounded caches was rejected because permanent failures retain growing histories; renaming test doubles to "deterministic stubs" was rejected because it changes the name but not the behavior.

Consequences: most integration tests need the guarded local Postgres harness and become opt-in; CI keeps the existing real-DB lane. Third-party cache defaults are unchanged.

Upgrade trigger: the owner adds a real local JetStream broker, or a cache must survive a process restart.
