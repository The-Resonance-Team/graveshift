import type { AuditEntry } from '@graveshift/core';

export const MCP_BACKEND = Symbol('MCP_BACKEND');
export const MCP_POLICY = Symbol('MCP_POLICY');
export const MCP_ENV_MODE = Symbol('MCP_ENV_MODE');

export interface IncidentView {
  incident: {
    id: string;
    service: string;
    state: string;
    diagnosis?: { confidence: number } & Record<string, unknown>;
  } & Record<string, unknown>;
  severity?: string;
  category?: string;
  detections?: Array<{ rule: string }>;
  pr?: { url: string; number: number; branch: string };
  timeline?: Array<{ at: string; type: string; detail: string }>;
}

/** Rate and budget counters owned by the daemon. */
export interface LimitCounters {
  openPrsLastHour: number;
  actionsLast10Min: number;
  diagnosisLoops: number;
  llmSpentTodayUsd: number;
}

/** Everything the MCP tools read from the daemon. Tests inject a fake client. */
export interface McpBackend {
  listServices(): Promise<unknown[]>;
  listIncidents(): Promise<IncidentView[]>;
  getIncident(id: string): Promise<IncidentView | undefined>;
  listAudit(opts: { afterSeq: number; limit: number }): Promise<AuditEntry[]>;
  verifyChain(): Promise<unknown>;
  tailLogs(service: string, lines: number): Promise<string[]>;
  queryMetric(promql: string): Promise<number | null>;
  getCounters(): Promise<LimitCounters>;
}
