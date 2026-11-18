# SECURITY (STUB)

> Scaffold only. Full security requirements are SEC-1..SEC-12 in bootstrap doc section 9.3. Replace this stub.

Key rules to document here:

1. Production is read-only for agents. Fixes are draft PRs only; the bot never merges.
2. Never mount `/var/run/docker.sock` into graveshift (SEC-1); use the read-only socket proxy.
3. The actuator is separate and runs only HMAC-signed, approved, unexpired, single-use actions (SEC-2).
4. Redact before every LLM call, log, audit payload, Discord message and MCP response (SEC-4).
5. Secrets come only from env / K8s Secrets and are never logged (SEC-9).

**Note (from section 9.4):** the `pods/log` RBAC rule exposes log contents. For real users, offer a namespace-scoped Role variant instead of the broad ClusterRole.
