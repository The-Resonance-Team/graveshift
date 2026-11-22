import { isAuditScopeUsable, type AuditRecord, type AuditSink } from '../audit.sink';

export interface InMemoryAuditSinkOptions {
  // When set, a matching append rejects with this error, so a test can exercise a sink failure.
  readonly failWith?: Error;
  // When set, only the records it accepts reject. Together with failWith it selects one audit
  // stage, for example the outcome written after a draft pull request call. With no failWhen,
  // every append rejects.
  readonly failWhen?: (record: AuditRecord) => boolean;
}

const SINK_DOWN = new Error('the audit chain is unavailable');

const canonical = (value: unknown): string =>
  typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);

const facts = (record: AuditRecord): string =>
  JSON.stringify([record.actor, record.type, record.incidentId ?? null, canonical(record.payload)]);

/**
 * The test sink. It keeps every record in memory and makes no database call, so a test can
 * assert what was audited and in which chain. A record is cloned, so a later payload change
 * cannot edit it. One map per projectId reproduces the production rule that each Project owns
 * its own chain, so a test cannot pass on a write that leaked into another Project.
 */
export class InMemoryAuditSink implements AuditSink {
  private readonly chains = new Map<string, AuditRecord[]>();
  private readonly seen = new Map<string, string>();

  constructor(private readonly options: InMemoryAuditSinkOptions = {}) {}

  async append(record: AuditRecord): Promise<void> {
    // ADR 0018: the real sink refuses a record with no authenticated scope, so the test sink
    // refuses it too and a test cannot pass on an unscoped write.
    if (!isAuditScopeUsable({ projectId: record.projectId, actor: record.actor })) {
      throw new Error('an audit entry needs the authenticated projectId and actor');
    }
    const { failWith, failWhen } = this.options;
    if (failWhen === undefined ? failWith !== undefined : failWhen(record)) {
      throw failWith ?? SINK_DOWN;
    }
    const clone = structuredClone(record);
    const key = `${clone.projectId}:${clone.key}`;
    const prior = this.seen.get(key);
    if (prior !== undefined) {
      if (prior !== facts(clone)) throw new Error(`audit key ${clone.key} conflicts`);
      return;
    }
    const chain = this.chains.get(clone.projectId) ?? [];
    this.seen.set(key, facts(clone));
    this.chains.set(clone.projectId, [...chain, clone]);
  }

  /** Every record of one audit type across every chain, in append order. */
  ofType(type: string): AuditRecord[] {
    return [...this.chains.values()].flat().filter((record) => record.type === type);
  }

  /** The chain one Project owns, in append order. An unknown Project owns nothing. */
  entries(projectId: string): AuditRecord[] {
    return [...(this.chains.get(projectId) ?? [])];
  }

  /** Every projectId that owns at least one entry. */
  projects(): string[] {
    return [...this.chains.keys()];
  }
}
