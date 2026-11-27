# Event backbone: NATS JetStream with a normalised envelope

Status: accepted

> [ADR 0018](0018-project-scoped-state.md) supersedes the `tenantId` clause here. `projectId` replaces it.

All watcher input goes through NATS JetStream with at-least-once delivery and idempotency keys. Source integrations have two shapes: a Plugin is an in-process SDK for client frameworks, and a Collector is a daemon-side adapter for infrastructure and cloud state. Both publish one normalised event envelope that carries `tenantId` from v2. Docker and Kubernetes are one Collector among many, not the whole input.

All severities enter the queue. Warning and critical events drive detection; info events feed baselines and charts.

One rule engine evaluates the envelope. System rules give defaults; client rules override them by id. The config detects an override, warns the user, and requires confirmation before save. Rule evaluation stays in the daemon, never in a plugin.

Trade-off: a broker adds an operational dependency and possible duplicate delivery, but it lets watchers survive restarts and scale without changing the daemon.
