import { createHash } from 'node:crypto';

import { type AuditEntry, type ChainResult, AuditEntrySchema } from './schemas';

export const GENESIS_HASH = '0'.repeat(64);

/** Where a retained chain window starts. The head may be evicted after MAX_ENTRIES. */
export interface ChainAnchor {
  readonly seq: number;
  readonly prevHash: string;
}

export const GENESIS_ANCHOR: ChainAnchor = { seq: 1, prevHash: GENESIS_HASH };

export type AuditDraft = Pick<AuditEntry, 'seq' | 'at' | 'actor' | 'type' | 'payload'> &
  Pick<Partial<AuditEntry>, 'incidentId'>;

export type AuditInput = Pick<AuditEntry, 'actor' | 'type' | 'payload'> &
  Pick<Partial<AuditEntry>, 'incidentId'>;

/** One result shape for the chain helper and the daemon read route. */
export type VerifyResult = ChainResult;

/** One canonical byte string for every audit entry. The API and the daemon both use it. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashEntry(draft: AuditDraft, prevHash: string): string {
  const body = canonical([
    draft.seq,
    draft.at,
    draft.actor,
    draft.type,
    draft.incidentId ?? null,
    draft.payload,
    prevHash,
  ]);
  return createHash('sha256').update(body).digest('hex');
}

export function makeAuditEntry(
  seq: number,
  at: string,
  input: AuditInput,
  prevHash: string,
): AuditEntry {
  const draft: AuditDraft = {
    seq,
    at,
    actor: input.actor,
    type: input.type,
    payload: AuditEntrySchema.shape.payload.parse(JSON.parse(JSON.stringify(input.payload))),
    ...(input.incidentId === undefined ? {} : { incidentId: input.incidentId }),
  };
  return AuditEntrySchema.parse({ ...draft, prevHash, hash: hashEntry(draft, prevHash) });
}

export function verifyEntries(
  entries: readonly AuditEntry[],
  anchor: ChainAnchor = GENESIS_ANCHOR,
): VerifyResult {
  let prevHash = anchor.prevHash;
  for (const [index, entry] of entries.entries()) {
    const expectedSeq = anchor.seq + index;
    if (entry.seq !== expectedSeq) {
      return { ok: false, brokenAtSeq: expectedSeq, reason: 'sequence gap or reorder' };
    }
    if (entry.prevHash !== prevHash) {
      return { ok: false, brokenAtSeq: entry.seq, reason: 'prevHash mismatch' };
    }
    if (hashEntry(entry, entry.prevHash) !== entry.hash) {
      return { ok: false, brokenAtSeq: entry.seq, reason: 'hash mismatch' };
    }
    prevHash = entry.hash;
  }
  return { ok: true, length: entries.length };
}
