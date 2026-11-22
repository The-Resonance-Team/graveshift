import type {
  AuditEntry,
  ChainResult,
  CounterSnapshot,
  IncidentView,
  ServiceView,
} from '@graveshift/core';

export const MCP_BACKEND = Symbol('MCP_BACKEND');
export const MCP_POLICY = Symbol('MCP_POLICY');
export const MCP_ENV_MODE = Symbol('MCP_ENV_MODE');

export type {
  ChainResult,
  CounterSnapshot,
  IncidentView,
  LimitCounters,
  ServiceView,
} from '@graveshift/core';

/** Everything the MCP tools read from the daemon. Tests inject a fake client. */
export interface McpBackend {
  listServices(): Promise<ServiceView[]>;
  listIncidents(): Promise<IncidentView[]>;
  getIncident(id: string): Promise<IncidentView | undefined>;
  listAudit(opts: { afterSeq: number; limit: number }): Promise<AuditEntry[]>;
  verifyChain(): Promise<ChainResult>;
  tailLogs(service: string, lines: number): Promise<string[]>;
  queryMetric(promql: string): Promise<number | null>;
  getCounters(): Promise<CounterSnapshot>;
}
