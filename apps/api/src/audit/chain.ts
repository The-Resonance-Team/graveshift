import type { AuditEntry } from '@graveshift/core';

import type { ChainDraft, VerifyResult } from './audit.types';

export const GENESIS_HASH = '0'.repeat(64);

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashEntry(draft: ChainDraft, prevHash: string): string {
  const body = canonical([
    draft.seq,
    draft.at,
    draft.actor,
    draft.type,
    draft.incidentId ?? null,
    draft.payload,
    prevHash,
  ]);
  return new Bun.CryptoHasher('sha256').update(body).digest('hex');
}

// ponytail: tail truncation needs an external anchor; upgrade if the head hash is published.
export function verifyEntries(entries: readonly AuditEntry[]): VerifyResult {
  let prevHash = GENESIS_HASH;
  for (const [index, entry] of entries.entries()) {
    const expectedSeq = index + 1;
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
