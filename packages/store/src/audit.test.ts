import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { type AuditInput, createSqliteAuditStore } from './sqlite';
import { verifyEntries } from './chain';

const input = fc.record({
  actor: fc.string({ minLength: 1 }),
  type: fc.string({ minLength: 1 }),
  payload: fc.dictionary(fc.string(), fc.jsonValue()),
});

async function fill(inputs: AuditInput[]) {
  const sqlite = new Database(':memory:');
  const store = createSqliteAuditStore(sqlite);
  await inputs.reduce(
    (previous, item) => previous.then(() => store.append(item).then(() => undefined)),
    Promise.resolve(),
  );
  return { sqlite, store };
}

describe('audit chain', () => {
  test('empty chain verifies', async () => {
    const { store } = await fill([]);
    expect(await store.verifyChain()).toEqual({ ok: true, length: 0 });
  });

  test('property: any appended sequence verifies and survives a round trip', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(input, { maxLength: 15 }), async (inputs) => {
        const { store } = await fill(inputs);
        expect(await store.verifyChain()).toEqual({ ok: true, length: inputs.length });
        const entries = await store.list({ limit: 100 });
        expect(entries.map((e) => e.seq)).toEqual(inputs.map((_, i) => i + 1));
        expect(verifyEntries(entries).ok).toBe(true);
      }),
    );
  });

  test('property: changing any field of any entry breaks the chain at that entry', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(input, { minLength: 1, maxLength: 10 }),
        fc.nat(),
        fc.constantFrom('actor', 'type', 'payload', 'hash', 'prevHash', 'at'),
        async (inputs, pick, field) => {
          const { store } = await fill(inputs);
          const entries = await store.list();
          const index = pick % entries.length;
          const target = entries[index]!;
          const forged =
            field === 'payload'
              ? { ...target, payload: { ...target.payload, forged: true } }
              : {
                  ...target,
                  [field]: field === 'at' ? '2000-01-01T00:00:00.000Z' : `${'f'.repeat(64)}`,
                };
          const tampered = entries.map((e, i) => (i === index ? forged : e));
          const result = verifyEntries(tampered);
          if (JSON.stringify(forged) === JSON.stringify(target)) return;
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.brokenAtSeq).toBe(target.seq);
        },
      ),
    );
  });

  test('property: removing or reordering entries is detected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(input, { minLength: 3, maxLength: 10 }),
        fc.nat(),
        async (inputs, pick) => {
          const { store } = await fill(inputs);
          const entries = await store.list();
          const middle = 1 + (pick % (entries.length - 2));
          expect(verifyEntries(entries.filter((_, i) => i !== middle)).ok).toBe(false);
          const swapped = [...entries];
          [swapped[0], swapped[middle]] = [swapped[middle]!, swapped[0]!];
          expect(verifyEntries(swapped).ok).toBe(false);
        },
      ),
    );
  });

  test('database rejects UPDATE and DELETE', async () => {
    const { sqlite } = await fill([{ actor: 'a', type: 't', payload: {} }]);
    expect(() => sqlite.exec(`UPDATE audit_log SET actor = 'x'`)).toThrow('append-only');
    expect(() => sqlite.exec('DELETE FROM audit_log')).toThrow('append-only');
  });

  test('verifyChain detects tampering that bypasses the triggers', async () => {
    const { sqlite, store } = await fill([
      { actor: 'a', type: 't', payload: { n: 1 } },
      { actor: 'b', type: 't', payload: { n: 2 }, incidentId: 'inc-1' },
    ]);
    sqlite.exec('DROP TRIGGER audit_log_no_update');
    sqlite.exec(`UPDATE audit_log SET payload = '{"n":99}' WHERE seq = 1`);
    expect(await store.verifyChain()).toEqual({
      ok: false,
      brokenAtSeq: 1,
      reason: 'hash mismatch',
    });
  });

  test('payload with a __proto__ key still verifies', async () => {
    const { store } = await fill([
      { actor: 'a', type: 't', payload: JSON.parse('{"__proto__":{"x":1},"y":2}') },
    ]);
    expect(await store.verifyChain()).toEqual({ ok: true, length: 1 });
  });

  test('list paginates by afterSeq', async () => {
    const { store } = await fill([1, 2, 3].map((n) => ({ actor: 'a', type: 't', payload: { n } })));
    expect((await store.list({ afterSeq: 1, limit: 1 })).map((e) => e.seq)).toEqual([2]);
  });
});
