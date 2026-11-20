import type { AuditEntry, Incident } from '@graveshift/core';

// Shapes served by apps/daemon/src/http.ts and apps/daemon/src/registry.ts.
export type Severity = 'info' | 'warning' | 'critical';
export type Health = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type Mode = 'dry-run' | 'propose' | 'act';

export interface Grave {
  name: string;
  runtime: 'docker' | 'k8s';
  namespace?: string;
  health: Health;
  incidentId?: string;
  severity?: Severity;
  state?: Incident['state'];
}

export interface Detection {
  id: string;
  rule: string;
  service: string;
  severity: Severity;
  message: string;
  observedAt: string;
}

export interface TimelineEntry {
  at: string;
  type: string;
  detail: string;
}

export interface IncidentView {
  incident: Incident;
  severity: Severity;
  detections: Detection[];
  category?: string;
  diagnosisSource?: 'llm' | 'rules-only';
  needsHuman?: string;
  pr?: { url: string; number: number; branch: string };
  timeline: TimelineEntry[];
}

export interface ModeView {
  policy: Mode;
  effective: Mode;
  warning?: string;
}

export type ChainStatus =
  | { ok: true; length: number }
  | { ok: false; brokenAtSeq: number; reason: string };

export type DaemonEvent =
  | { type: 'incident'; view: IncidentView }
  | { type: 'timeline'; incidentId: string; entry: TimelineEntry };

export type { AuditEntry };
