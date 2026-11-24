import type { AuditEntry } from '@graveshift/core';
import { describe, expect, test } from 'bun:test';

import { build, fakeAuditReader, fakeDaemon } from './mcp-daemon-read.fixture';

describe('the API-owned audit chain', () => {
  test('get_audit_log and verify_audit_chain read from AUDIT_READER, not the daemon', async () => {
    const entry: AuditEntry = {
      seq: 1,
      at: '2026-01-01T00:00:00.000Z',
      actor: 'policy',
      type: 'policy.decision',
      payload: { effect: 'allow' },
      hash: 'abc',
      prevHash: 'def',
    } as AuditEntry;
    const reader = fakeAuditReader([entry], { ok: false, brokenAtSeq: 1, reason: 'broken chain' });
    const daemon = fakeDaemon();
    const { tools } = await build(daemon.client, reader);
    expect(await tools.getAuditLog({ afterSeq: 0, limit: 10 })).toEqual([entry]);
    expect(await tools.verifyAuditChain()).toEqual({
      ok: false,
      brokenAtSeq: 1,
      reason: 'broken chain',
    });
    expect(daemon.calls).toEqual([]);
  });

  test('verify_audit_chain redacts the chain result', async () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';
    const reader = fakeAuditReader([], {
      ok: false,
      brokenAtSeq: 1,
      reason: `key ${secret}`,
    });
    const { tools } = await build(fakeDaemon().client, reader);
    const result = (await tools.verifyAuditChain()) as { reason: string };
    expect(result.reason).not.toContain(secret);
    expect(result.reason).toContain('[REDACTED:aws_key]');
  });
});
