import { describe, expect, test } from 'bun:test';
import {
  canonical,
  GENESIS_HASH,
  hashEntry,
  type AuditEntry,
  verifyEntries,
} from '@graveshift/core';
import fc from 'fast-check';

import type { ChainDraft } from './audit.types';

const at = '2026-11-21T00:00:00.000Z';
const facts = fc.record({
  actor: fc.string({ minLength: 1 }),
  type: fc.string({ minLength: 1 }),
  payload: fc.dictionary(fc.string(), fc.jsonValue()),
});

function entries(inputs: Omit<ChainDraft, 'seq' | 'at'>[]): AuditEntry[] {
  return inputs.reduce<AuditEntry[]>((chain, input) => {
    const draft = { ...input, seq: chain.length + 1, at };
    const prevHash = chain.at(-1)?.hash ?? GENESIS_HASH;
    chain.push({ ...draft, prevHash, hash: hashEntry(draft, prevHash) });
    return chain;
  }, []);
}

describe('canonical audit chain', () => {
  test('keeps the genesis value and the pre-move hash encoding', () => {
    const [entry] = entries([{ actor: 'fixture', type: 'test.event', payload: { n: 1 } }]);
    expect(entry?.prevHash).toBe('0'.repeat(64));
    expect(entry?.hash).toBe('104f44e4ddcc55a6afd4a467048d096919ec0341db5303fabee251bbda88fd5e');
  });

  test('verifies an empty chain', () => {
    expect(verifyEntries([])).toEqual({ ok: true, length: 0 });
  });

  test('property: every generated sequence verifies after a JSON round trip', () => {
    fc.assert(
      fc.property(fc.array(facts, { maxLength: 20 }), (inputs) => {
        const chain = entries(inputs);
        expect(verifyEntries(JSON.parse(JSON.stringify(chain)))).toEqual({
          ok: true,
          length: inputs.length,
        });
      }),
    );
  });

  test('property: object insertion order does not change the canonical encoding', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (payload) => {
        expect(canonical(payload)).toBe(
          canonical(Object.fromEntries(Object.entries(payload).reverse())),
        );
      }),
    );
    expect(canonical({ z: { b: 1, a: 2 }, a: [3, 2] })).toBe('{"a":[3,2],"z":{"a":2,"b":1}}');
  });

  test.each(['actor', 'type', 'payload', 'hash', 'prevHash', 'at', 'incidentId', 'seq'] as const)(
    'property: a changed %s is detected at the changed entry',
    (field) => {
      fc.assert(
        fc.property(fc.array(facts, { minLength: 1, maxLength: 12 }), fc.nat(), (inputs, pick) => {
          const chain = entries(inputs);
          const index = pick % chain.length;
          const target = chain[index]!;
          const changes = {
            actor: `${target.actor}!`,
            type: `${target.type}!`,
            payload: { replaced: target.payload },
            hash: `${target.hash.slice(1)}!`,
            prevHash: `${target.prevHash.slice(1)}!`,
            at: '2000-01-01T00:00:00.000Z',
            incidentId: 'forged-incident',
            seq: target.seq + 1,
          };
          chain[index] = { ...target, [field]: changes[field] };
          const result = verifyEntries(chain);
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.brokenAtSeq).toBe(target.seq);
        }),
      );
    },
  );

  test('property: removing the first or an interior entry, or reordering, breaks the chain', () => {
    fc.assert(
      fc.property(fc.array(facts, { minLength: 3, maxLength: 12 }), fc.nat(), (inputs, pick) => {
        const chain = entries(inputs);
        const middle = 1 + (pick % (chain.length - 2));
        expect(verifyEntries(chain.slice(1)).ok).toBe(false);
        expect(verifyEntries(chain.filter((_, index) => index !== middle)).ok).toBe(false);
        const swapped = [...chain];
        [swapped[0], swapped[middle]] = [swapped[middle]!, swapped[0]!];
        expect(verifyEntries(swapped).ok).toBe(false);
      }),
    );
  });

  test('retains the documented limit: a valid prefix cannot prove that the tail exists', () => {
    const chain = entries([1, 2].map((n) => ({ actor: 'fixture', type: 'test', payload: { n } })));
    expect(verifyEntries(chain.slice(0, 1))).toEqual({ ok: true, length: 1 });
  });
});
