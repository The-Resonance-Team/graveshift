import { describe, expect, test } from 'bun:test';

import { makeAuditEntry, verifyEntries } from './audit-chain';

describe('audit chain', () => {
  test('hashes a stable ordered chain and rejects edits, removals and reordering', () => {
    const first = makeAuditEntry(
      1,
      '2026-11-21T00:00:00.000Z',
      {
        actor: 'client-1',
        type: 'credential.created',
        payload: { id: 'cred-1', scopes: ['logs:read'] },
      },
      '0'.repeat(64),
    );
    const second = makeAuditEntry(
      2,
      '2026-11-21T00:00:01.000Z',
      {
        actor: 'client-1',
        type: 'credential.revoked',
        payload: { id: 'cred-1' },
      },
      first.hash,
    );

    expect(verifyEntries([first, second])).toEqual({ ok: true, length: 2 });
    expect(verifyEntries([{ ...first, actor: 'attacker' }, second])).toMatchObject({
      ok: false,
      brokenAtSeq: 1,
    });
    expect(verifyEntries([second])).toMatchObject({ ok: false, brokenAtSeq: 1 });
    expect(verifyEntries([second, first])).toMatchObject({ ok: false, brokenAtSeq: 1 });
  });

  test('a payload supplied with __proto__ verifies after a JSON round trip', () => {
    const payload = JSON.parse('{"__proto__":{"safe":true},"value":1}') as Record<string, unknown>;
    const entry = makeAuditEntry(
      1,
      '2026-11-21T00:00:00.000Z',
      {
        actor: 'client-1',
        type: 'credential.created',
        payload,
      },
      '0'.repeat(64),
    );
    const persisted = JSON.parse(JSON.stringify(entry));
    expect(verifyEntries([persisted])).toEqual({ ok: true, length: 1 });
    expect(
      verifyEntries([{ ...persisted, payload: { ...persisted.payload, changed: true } }]).ok,
    ).toBe(false);
  });
});
