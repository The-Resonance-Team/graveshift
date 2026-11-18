# Actuator — Design

## Interfaces
- `execute(request: ActionRequest): ActuationResult` — separate deployable with its own credentials.
- `verifyHmac(request, secret): boolean`.
- `consumeApproval(tokenId): boolean` — atomic single-use store.

## Data flow
Signed request → HMAC verify → approval consume → allowlist check → Docker restart / K8s patch → audit event → circuit-breaker monitor.

## Error handling
- Bad signature, expired token, replay, or off-list target → deny with a reason; no runtime change.
- Docker/K8s call failure → typed error, audit failure event.

## Testing
- fast-check: tokens never accepted twice/after expiry/from a non-approver; HMAC tamper tests; allowlist boundary tests.
