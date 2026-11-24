import type { AuditDraft, AuditEntry, CounterSnapshot, ServiceView } from '@graveshift/core';
import type { SharedPolicyContext } from '@graveshift/core/policy-context';
import type { RecordedHaunting } from '@graveshift/core/recorded';

import type { VerifyResult } from '../audit/audit.types';

export const MCP_BACKEND = Symbol('MCP_BACKEND');
export const MCP_AUDIT_WRITER = Symbol('MCP_AUDIT_WRITER');
export const MCP_POLICY = Symbol('MCP_POLICY');
export const MCP_ENV_MODE = Symbol('MCP_ENV_MODE');

/** Facts from the daemon and the API-owned Audit chain. No execution method is exposed. */
export interface McpBackend {
  listServices(): Promise<ServiceView[]>;
  listIncidents(): Promise<RecordedHaunting[]>;
  getIncident(id: string): Promise<RecordedHaunting | undefined>;
  listAudit(opts: { afterSeq: number; limit: number }): Promise<AuditEntry[]>;
  verifyChain(): Promise<VerifyResult>;
  tailLogs(service: string, lines: number): Promise<string[]>;
  queryMetric(promql: string): Promise<number | null>;
  /** Live daemon counters bound to one Haunting. A malformed or unavailable snapshot fails closed. */
  getCounters(incidentId: string): Promise<CounterSnapshot>;
  /** Complete policy facts bound to a Haunting. Missing facts fail closed. */
  policyContext(incidentId: string): Promise<SharedPolicyContext>;
}

/**
 * The explicit result of one audit handoff (ADR 0022). A key alone is not an acknowledgement:
 * the only positive outcome is the one written to the authenticated Project's chain.
 */
export type AuditAcknowledgement =
  | { readonly acknowledged: true; readonly key: string }
  | { readonly acknowledged: false; readonly reason: 'no_project' };

/**
 * The narrow write seam. The unauthenticated stdio path has no Project to key a chain, so it
 * implements this interface with a refusal; it never reports an acknowledged audit.
 */
export interface McpAuditWriter {
  auditDecision(draft: AuditDraft): Promise<AuditAcknowledgement>;
}
