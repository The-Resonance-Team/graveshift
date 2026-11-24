import { GENESIS_HASH, makeAuditEntry, type AuditDraft, type AuditEntry } from '@graveshift/core';

import {
  isAuditScopeUsable,
  type AuditRecord,
  type AuditSink,
  type AuditTransaction,
} from '../audit.sink';

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
 * The test adapter at the `AUDIT_SINK` seam. It keeps every record in memory and makes no
 * database call, so a test can assert what was audited and in which chain. A record is cloned,
 * so a later payload change cannot edit it. One map per projectId reproduces the production
 * rule that each Project owns its own chain, so a test cannot pass on a write that leaked into
 * another Project.
 */
export class InMemoryAuditSink implements AuditSink {
  private readonly chains = new Map<string, AuditRecord[]>();
  private readonly entriesByProject = new Map<string, AuditEntry[]>();
  private readonly seen = new Map<string, string>();

  constructor(private readonly options: InMemoryAuditSinkOptions = {}) {}

  append(projectId: string, draft: AuditDraft): Promise<AuditEntry> {
    // ADR 0018: the real adapter refuses a record with no authenticated scope, so the test
    // adapter refuses it too and a test cannot pass on an unscoped write.
    if (!isAuditScopeUsable({ projectId, actor: draft.actor })) {
      throw new Error('an audit entry needs the authenticated projectId and actor');
    }
    const record: AuditRecord = structuredClone({ ...draft, projectId });
    const { failWith, failWhen } = this.options;
    if (failWhen === undefined ? failWith !== undefined : failWhen(record)) {
      throw failWith ?? SINK_DOWN;
    }
    const key = `${record.projectId}:${record.key}`;
    const prior = this.seen.get(key);
    if (prior !== undefined) {
      if (prior !== facts(record)) throw new Error(`audit key ${record.key} conflicts`);
      const priorEntries = this.entriesByProject.get(record.projectId) ?? [];
      return Promise.resolve(priorEntries[priorEntries.length - 1]!);
    }
    const chain = this.chains.get(record.projectId) ?? [];
    const entries = this.entriesByProject.get(record.projectId) ?? [];
    const prevHash = entries.at(-1)?.hash ?? GENESIS_HASH;
    const entry = makeAuditEntry(chain.length + 1, new Date().toISOString(), draft, prevHash);
    this.seen.set(key, facts(record));
    this.chains.set(record.projectId, [...chain, record]);
    this.entriesByProject.set(record.projectId, [...entries, entry]);
    return Promise.resolve(entry);
  }

  appendInTx(_tx: AuditTransaction, projectId: string, draft: AuditDraft): Promise<AuditEntry> {
    return this.append(projectId, draft);
  }

  transaction<Result>(work: (tx: AuditTransaction) => Promise<Result>): Promise<Result> {
    return work(undefined as unknown as AuditTransaction);
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
