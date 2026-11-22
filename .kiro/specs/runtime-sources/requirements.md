# Runtime Sources — Requirements

## R1 Collector contract
- R1.1 A runtime Collector implements `start(context)` and `stop()`, and publishes canonical Event envelopes through its supplied Publisher.
- R1.2 Docker and Kubernetes adapters provide inventory, log and health reads and pass shared lifetime tests.

## R2 Reconnect
- R2.1 WHEN a source connection drops THE SYSTEM SHALL reconnect with exponential backoff.
- R2.2 WHEN reconnected THE SYSTEM SHALL resume the event watch without losing undelivered events.

## R3 Docker source
- R3.1 The Docker source SHALL connect only through the docker-socket-proxy URL and never mount `docker.sock` (SEC-1).

## R4 K8s source
- R4.1 The K8s source SHALL use `@kubernetes/client-node` with the in-cluster ServiceAccount and `graveshift-reader` RBAC.
- R4.2 A Kubernetes event maps to a normalized runtime Event envelope. Its Grave identity includes the configured Collector, namespace and deployment.
