import type { EventEnvelope, Incident } from '@graveshift/core';

export const RULE_IDS = [
  'log.error-burst',
  'runtime.restart-loop',
  'runtime.oom',
  'runtime.unhealthy',
  'metric.5xx-rate',
  'metric.p95-latency',
  'k8s.image-pull',
  'http.error',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export type Severity = 'info' | 'warning' | 'critical';

export interface Detection {
  id: string;
  projectId: string;
  eventId: string;
  traceId: string;
  rule: RuleId;
  service: string;
  severity: Severity;
  fingerprint: string;
  message: string;
  observedAt: string;
}

export interface Silence {
  projectId: string;
  service: string;
  from: string;
  until: string;
}

export interface IncidentChange {
  type: 'opened' | 'updated';
  projectId: string;
  incident: Incident;
  severity: Severity;
  detections: Detection[];
}

export type WatcherOutcome = { envelope: EventEnvelope } & (
  | { status: 'accepted'; detection: Detection; change: IncidentChange }
  | { status: 'duplicate' | 'suppressed'; detection: Detection }
);

export const WINDOWS = {
  errorBurstMs: 60_000,
  errorBurstCount: 5,
  restartLoopMs: 5 * 60_000,
  restartLoopCount: 3,
  failedChecks: 3,
  rate5xxThreshold: 0.05,
  rate5xxForMs: 60_000,
  p95ThresholdSeconds: 1.5,
  dedupeMs: 10 * 60_000,
} as const;
