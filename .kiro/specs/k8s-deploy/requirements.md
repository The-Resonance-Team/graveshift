# Kubernetes Deploy — Requirements

## R1 Manifests
- R1.1 WHEN deploying THE SYSTEM SHALL provide a kustomize base plus a `kind` overlay under `deploy/k8s`.

## R2 RBAC (§9.4)
- R2.1 `graveshift-reader` SHALL have cluster-wide get/list/watch only, never patch.
- R2.2 `graveshift-actuator` SHALL have a namespace Role limited to patch `api`/`worker` deployments and scale `worker`; no cluster-admin.
- R2.3 RBAC changes SHALL require a spec change to this folder.

## R3 Hardening
- R3.1 Pods SHALL set `runAsNonRoot`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false` and seccomp `RuntimeDefault` (SEC-8).
- R3.2 A NetworkPolicy SHALL restrict egress to the API server, Prometheus and LLM/GitHub/Discord endpoints.

## R4 Bootstrap
- R4.1 `deploy/kind/bootstrap.sh` SHALL bring up the demo stack in under 5 minutes.

## R5 Verification
- R5.1 `kubectl auth can-i` tests SHALL assert the reader cannot patch (`no`) and the actuator can patch only the allowlisted resources.
