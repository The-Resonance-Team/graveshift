---
inclusion: fileMatch
fileMatchPattern: ["deploy/**", "**/Dockerfile", "packages/sources-*/**", "packages/actuator/**"]
---
# Docker and Kubernetes

## SEC-1 (Docker socket)
Never mount `/var/run/docker.sock` into graveshift. Use only docker-socket-proxy with
`CONTAINERS=1 EVENTS=1 LOGS=1 INFO=1`, everything else `0`, and `POST=0`.
The actuator gets its own proxy with `POST=1` limited to restart; if the proxy is too coarse,
the actuator talks to the socket itself but implements only `restart` for allowlisted names.

## SEC-2 (Actuator isolation)
The actuator is a separate container/Deployment with its own credentials. It accepts only
HMAC-signed `ActionRequest`s carrying an approved, unexpired, single-use approval and an
allowlisted target.

## SEC-8 (Hardening)
- Compose: non-root, `read_only: true`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, CPU/memory limits.
- K8s: `runAsNonRoot`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, seccomp `RuntimeDefault`, and a NetworkPolicy (egress only to API server, Prometheus, LLM/GitHub/Discord).

## RBAC (§9.4)
- `graveshift-reader`: cluster-wide get/list/watch on pods, logs, events, services, endpoints, namespaces, nodes and workloads. Never patch.
- `graveshift-actuator`: namespace Role on `candy-shop`, patch only deployments `api`/`worker` and scale `worker`. No cluster-admin.
- Rollout restart = patch `spec.template.metadata.annotations["kubectl.kubernetes.io/restartedAt"]`.
- Verify: `kubectl auth can-i --as=system:serviceaccount:graveshift:graveshift-reader patch deployments -n candy-shop` → `no`.

## Images
Multi-stage, non-root UID 10001, healthcheck in every image.
