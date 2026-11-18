# Kubernetes Deploy — Design

## Interfaces
- `deploy/k8s/base/` kustomization + `deploy/k8s/overlays/kind/`.
- `rbac.yaml`, `networkpolicy.yaml`, `deploy/kind/bootstrap.sh`.

## Data flow
Bootstrap script creates the kind cluster, applies base + overlay, waits for readiness (< 5 min), then runs `kubectl auth can-i` assertions.

## Error handling
- RBAC/NetworkPolicy lint failures block deployment. Verification failures print the exact `can-i` result.

## Testing
- kubeconform/manifest lint; `kubectl auth can-i` positive and negative assertions; bootstrap timing check.
