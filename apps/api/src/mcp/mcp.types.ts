import type { AuditDraft, AuditEntry, CounterSnapshot } from '@graveshift/core';
import type { SharedPolicyContext } from '@graveshift/core/policy-context';
import type { RecordedHaunting } from '@graveshift/core/recorded';
import type { GraveInfo } from '@graveshift/integrations';

import type { VerifyResult } from '../audit/audit.types';

export const MCP_BACKEND = Symbol('MCP_BACKEND');
export const MCP_POLICY = Symbol('MCP_POLICY');
export const MCP_ENV_MODE = Symbol('MCP_ENV_MODE');

/** Facts from the daemon and the API-owned Audit chain. No execution method is exposed. */
export interface McpBackend {
  listServices(): Promise<GraveInfo[]>;
  listIncidents(): Promise<RecordedHaunting[]>;
  getIncident(id: string): Promise<RecordedHaunting | undefined>;
  listAudit(opts: { afterSeq: number; limit: number }): Promise<AuditEntry[]>;
  verifyChain(): Promise<VerifyResult>;
  tailLogs(service: string, lines: number): Promise<string[]>;
  queryMetric(promql: string): Promise<number | null>;
  /** Live daemon counters. A malformed or unavailable snapshot fails closed. */
  getCounters(): Promise<CounterSnapshot>;
  /** Complete policy facts bound to a Haunting. Missing facts fail closed. */
  policyContext(incidentId: string): Promise<SharedPolicyContext>;
  /** Durable acknowledgement of a proposal audit draft. */
  auditDecision(draft: AuditDraft): Promise<Pick<AuditDraft, 'key'>>;
}
