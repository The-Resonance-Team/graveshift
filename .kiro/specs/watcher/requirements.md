# Watcher (Wraith) — Requirements

## R1 Detector rules (§10.2)
- R1.1 WHEN at least 5 error lines occur within 60 s for one service THE SYSTEM SHALL emit `log.error-burst`.
- R1.2 WHEN 3 restarts occur in 5 min or CrashLoopBackOff is seen THE SYSTEM SHALL emit `runtime.restart-loop`.
- R1.3 WHEN an OOM event or OOMKilled is seen THE SYSTEM SHALL emit `runtime.oom`.
- R1.4 WHEN health/readiness fails 3 consecutive times THE SYSTEM SHALL emit `runtime.unhealthy`.
- R1.5 WHEN the 5xx rate exceeds 5% for 1 min THE SYSTEM SHALL emit `metric.5xx-rate`.
- R1.6 WHEN p95 latency exceeds 1.5 s THE SYSTEM SHALL emit `metric.p95-latency`.
- R1.7 WHEN ImagePullBackOff or ErrImagePull is seen THE SYSTEM SHALL emit `k8s.image-pull`.

## R2 Dedupe and grouping
- R2.1 WHEN a duplicate signal arrives within 10 min THE SYSTEM SHALL dedupe it by fingerprint.
- R2.2 WHEN multiple signals target one service THE SYSTEM SHALL group them into a single incident.

## R3 Severity
- R3.1 WHEN an incident is created THE SYSTEM SHALL assign a severity from its signals.

## R4 Silences
- R4.1 WHEN an active silence matches a signal THE SYSTEM SHALL suppress it.

## R5 Metrics polling
- R5.1 The watcher SHALL poll PromQL for metric-based rules on a fixed interval.
