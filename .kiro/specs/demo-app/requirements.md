# Demo App (Haunted Candy Shop) — Requirements

## R1 Scenarios (§12)
- R1.1 WHEN `null-candy` is injected THE SYSTEM SHALL cause a TypeError 5xx on `GET /candies/:id`, detected by `log.error-burst` + `metric.5xx-rate`, yielding a null-guard draft PR with a unit test.
- R1.2 WHEN `memory-leech` is injected THE SYSTEM SHALL leak buffers to OOMKilled/CrashLoopBackOff, detected by `runtime.oom` / `runtime.restart-loop`, yielding a Bless → restart + leak-fix draft PR.
- R1.3 WHEN `wrong-potion` is injected THE SYSTEM SHALL use a bad `DATABASE_URL`, detected by `log.error-burst` + `runtime.unhealthy`, yielding a config-revert draft PR.
- R1.4 Stretch scenarios `slow-curse` and `image-ghost` SHALL map to `metric.p95-latency` and `k8s.image-pull`.

## R2 Fault control
- R2.1 WHEN `POST /__haunt {scenario}` is called THE SYSTEM SHALL require `HAUNT_TOKEN` and route requests to real buggy source code via a runtime flag.

## R3 Observability
- R3.1 The app SHALL expose `/metrics` with `http_requests_total{status}` and `http_request_duration_seconds`, and `/healthz`.

## R4 Reset
- R4.1 WHEN reset is triggered THE SYSTEM SHALL restore health, close demo PRs and archive incidents (owner-only).
