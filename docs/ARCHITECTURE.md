# ARCHITECTURE (STUB)

> Scaffold only. Content comes from bootstrap doc section 5. Replace this stub.

Graveshift runs next to production in two modes: Docker Compose and Kubernetes.

- **Compose mode:** daemon + read-only docker-socket-proxy + Prometheus + separate actuator.
- **Kubernetes mode:** Deployment with `graveshift-reader` ServiceAccount; separate actuator with a namespaced Role.
- **Flow:** Wraith (watch) -> Medium (diagnose, via LlmGateway) -> Exorcist (draft PR only) -> Banshee (Discord approval).
- **Guardrails:** deterministic PolicyEngine (default deny), Redactor before every LLM call, append-only hash-chained audit log.

Diagrams (incident state machine, main demo sequence) and the full component list live in bootstrap doc section 5.
