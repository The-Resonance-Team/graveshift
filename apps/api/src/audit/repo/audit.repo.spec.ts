import { describe, expect, test } from 'bun:test';
import { GENESIS_HASH, makeAuditEntry, type AuditEntry } from '@graveshift/core';
import type { AuditEntry as PrismaAuditEntry } from '@prisma/client';

import type { PrismaService } from '../../infra/prisma.service';
import { AuditRepo } from './audit.repo';

const PROJECT = 'project-1';

const build = (): AuditEntry[] => {
  const first = makeAuditEntry(
    1,
    '2026-11-22T00:00:00.000Z',
    { actor: 'client-1', type: 'credential.created', payload: { id: 'cred-1' } },
    GENESIS_HASH,
  );
  const second = makeAuditEntry(
    2,
    '2026-11-22T00:00:01.000Z',
    { actor: 'client-1', type: 'credential.revoked', payload: { id: 'cred-1' } },
    first.hash,
  );
  const third = makeAuditEntry(
    3,
    '2026-11-22T00:00:02.000Z',
    { actor: 'client-1', type: 'credential.created', payload: { id: 'cred-2' } },
    second.hash,
  );
  return [first, second, third];
};

const toRow = (entry: AuditEntry): PrismaAuditEntry => ({
  projectId: PROJECT,
  seq: entry.seq,
  at: new Date(entry.at),
  actor: entry.actor,
  type: entry.type,
  incidentId: entry.incidentId ?? null,
  payload: entry.payload as PrismaAuditEntry['payload'],
  prevHash: entry.prevHash,
  hash: entry.hash,
});

/** A repository over a fixed row list. No database is used. */
const repoOver = (rows: PrismaAuditEntry[]) =>
  new AuditRepo({
    auditEntry: { findMany: async () => rows },
  } as unknown as PrismaService);

describe('AuditRepo.verifyChain (pure)', () => {
  test('accepts an intact chain that starts at the 64-zero genesis hash', async () => {
    const entries = build();
    expect(entries[0]?.prevHash).toBe('0'.repeat(64));
    expect(await repoOver(entries.map(toRow)).verifyChain(PROJECT)).toEqual({
      ok: true,
      length: 3,
    });
  });

  test('an empty chain is valid', async () => {
    expect(await repoOver([]).verifyChain(PROJECT)).toEqual({ ok: true, length: 0 });
  });

  test('detects an edited field', async () => {
    const rows = build().map(toRow);
    rows[1] = { ...rows[1]!, actor: 'attacker' };
    expect(await repoOver(rows).verifyChain(PROJECT)).toMatchObject({
      ok: false,
      brokenAtSeq: 2,
      reason: 'hash mismatch',
    });
  });

  test('detects an edited payload', async () => {
    const rows = build().map(toRow);
    rows[0] = { ...rows[0]!, payload: { id: 'other' } };
    expect(await repoOver(rows).verifyChain(PROJECT)).toMatchObject({ ok: false, brokenAtSeq: 1 });
  });

  test('detects a removed entry', async () => {
    const rows = build().map(toRow);
    rows.splice(1, 1);
    expect(await repoOver(rows).verifyChain(PROJECT)).toMatchObject({
      ok: false,
      brokenAtSeq: 2,
      reason: 'sequence gap or reorder',
    });
  });

  test('detects reordered entries', async () => {
    const [a, b, c] = build().map(toRow);
    expect(await repoOver([a!, c!, b!]).verifyChain(PROJECT)).toMatchObject({
      ok: false,
      brokenAtSeq: 2,
      reason: 'sequence gap or reorder',
    });
  });

  test('a payload with a __proto__ key verifies and detects a later edit', async () => {
    const payload = JSON.parse('{"__proto__":{"safe":true},"value":1}') as Record<string, unknown>;
    const entry = makeAuditEntry(
      1,
      '2026-11-22T00:00:00.000Z',
      { actor: 'client-1', type: 'test', payload },
      GENESIS_HASH,
    );
    // Round-trip through JSON, as PostgreSQL JSONB does.
    const stored = JSON.parse(JSON.stringify(entry)) as AuditEntry;
    expect(await repoOver([toRow(stored)]).verifyChain(PROJECT)).toEqual({ ok: true, length: 1 });
    const edited = toRow({ ...stored, payload: { ...stored.payload, value: 2 } });
    expect(await repoOver([edited]).verifyChain(PROJECT)).toMatchObject({
      ok: false,
      brokenAtSeq: 1,
    });
  });
});
