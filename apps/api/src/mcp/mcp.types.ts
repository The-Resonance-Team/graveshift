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

/** Everything the MCP tools read. Tests inject a fake; production has no read API yet. */
export interface McpBackend {
  listServices(): Promise<unknown[]>;
  listIncidents(): Promise<IncidentView[]>;
  getIncident(id: string): Promise<IncidentView | undefined>;
  listAudit(opts: { afterSeq: number; limit: number }): Promise<AuditEntry[]>;
  verifyChain(): Promise<unknown>;
  tailLogs(service: string, lines: number): Promise<string[]>;
  queryMetric(promql: string): Promise<number | null>;
}
