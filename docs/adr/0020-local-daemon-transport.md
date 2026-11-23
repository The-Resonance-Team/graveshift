# Co-locate the external interface and daemon in v2

Status: accepted

On 2026-11-21 the owner chose one self-hosted machine for the external interface and daemon in v2. They remain separate processes. A private local HTTP seam carries owned commands and reads. Each hop authenticates with a dedicated internal credential. The daemon binds to loopback, or an unpublished private container network on the same host. External clients use only the external interface.

ADR 0004 still gives the daemon use cases and orchestration. ADR 0006 still gives the external interface authentication, rate limits, generated contracts and MCP. ADR 0012 still gives `apps/api` the PostgreSQL schema, migrations and durable state operations. NATS JetStream remains the Event envelope backbone; this decision does not add another event input path.

The dedicated credentials are `GRAVESHIFT_API_INTERNAL_TOKEN`, presented by the daemon or actuator to the API and checked by its InternalGuard on every `/internal/*` route, and `GRAVESHIFT_DAEMON_INTERNAL_TOKEN`, presented by the API's named outbound client to the daemon. Both are required and must differ; boot fails closed when they match. The daemon config applies the same two-credential rule.

The trade-off is a co-location requirement and a synchronous private hop. In return, v2 needs no remote discovery or command-reply protocol on the event backbone. Recheck before deployment on separate hosts. This resolves the topology direction in issue #61; the implementation must preserve these owners.
