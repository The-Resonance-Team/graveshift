# Runtime Sources — Requirements

## R1 RuntimeSource contract
- R1.1 WHEN a runtime source is registered THE SYSTEM SHALL implement `listServices`, `watchEvents`, `tailLogs` and `getHealth`.
- R1.2 Docker and K8s implementations SHALL pass the shared contract suite.

## R2 Reconnect
- R2.1 WHEN a source connection drops THE SYSTEM SHALL reconnect with exponential backoff.
- R2.2 WHEN reconnected THE SYSTEM SHALL resume the event watch without losing undelivered events.

## R3 Docker source
- R3.1 The Docker source SHALL connect only through the docker-socket-proxy URL and never mount `docker.sock` (SEC-1).

## R4 K8s source
- R4.1 The K8s source SHALL use `@kubernetes/client-node` with the in-cluster ServiceAccount and `graveshift-reader` RBAC.
- R4.2 WHEN a K8s event arrives THE SYSTEM SHALL map it to the normalized signal set (OOM, restart, ImagePullBackOff, unhealthy).
