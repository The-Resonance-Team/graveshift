import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { AuditDraft } from '@graveshift/core';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import request from 'supertest';

import { dbTestEnabled, resetDatabase } from '../../test/database/fixtures';
import {
  AUDIT_TEST_PROJECT,
  AUDIT_TEST_TOKEN,
  createAuditTestApp,
} from '../audit/testing/audit-http';
import { build, openAuditRepo, SECRET, startDaemon } from './mcp-daemon-read.fixture';

const draft: AuditDraft = {
  key: 'mcp:audit-read:1',
  actor: 'policy',
  type: 'policy.decision',
  payload: { effect: 'allow' },
};

describe.skipIf(!dbTestEnabled)('the API-owned audit chain', () => {
  let repo: Awaited<ReturnType<typeof openAuditRepo>>;
  let app: INestApplication;

  beforeAll(async () => {
    repo = await openAuditRepo();
    app = await createAuditTestApp(repo.audit);
  });
  beforeEach(async () => resetDatabase(repo.db));
  afterAll(async () => {
    await app.close();
    await repo.close();
  });

  const post = (input: typeof draft) =>
    request(app.getHttpServer())
      .post('/internal/audit')
      .set('Authorization', `Bearer ${AUDIT_TEST_TOKEN}`)
      .send({ projectId: AUDIT_TEST_PROJECT, draft: input });

  test('get_audit_log and verify_audit_chain read the durable chain, not the daemon', async () => {
    expect((await post(draft)).status).toBe(200);
    const entry = (await repo.audit.list(AUDIT_TEST_PROJECT))[0];
    expect(entry).toMatchObject({ type: 'policy.decision', payload: { effect: 'allow' } });
    const daemon = startDaemon();
    try {
      const { tools } = await build(daemon.client, repo.audit);
      expect(await tools.getAuditLog({ afterSeq: 0, limit: 10 })).toEqual([
        { ...entry, hash: '[REDACTED:entropy]' },
      ]);
      expect(await tools.verifyAuditChain()).toEqual({ ok: true, length: 1 });
      expect(daemon.calls).toEqual([]);
    } finally {
      daemon.stop();
    }
  });

  test('a broken durable chain is reported without any daemon read', async () => {
    expect((await post(draft)).status).toBe(200);
    await repo.db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.auditEntry.update({
        where: { projectId_seq: { projectId: AUDIT_TEST_PROJECT, seq: 1 } },
        data: { hash: 'f'.repeat(64) },
      });
    });
    const daemon = startDaemon();
    try {
      const { tools } = await build(daemon.client, repo.audit);
      expect(await tools.verifyAuditChain()).toEqual({
        ok: false,
        brokenAtSeq: 1,
        reason: 'hash mismatch',
      });
      expect(daemon.calls).toEqual([]);
    } finally {
      daemon.stop();
    }
  });

  test('propose_fix writes an acknowledged entry to the durable chain', async () => {
    const daemon = startDaemon();
    try {
      const { tools } = await build(daemon.client, repo.audit);
      const result = (await tools.proposeFix({ incidentId: 'inc1', action: 'open_pr' })) as {
        audit: { acknowledged: boolean };
      };
      expect(result.audit.acknowledged).toBe(true);
      expect(await repo.audit.list(AUDIT_TEST_PROJECT)).toEqual([
        expect.objectContaining({ type: 'policy.decision' }),
      ]);
    } finally {
      daemon.stop();
    }
  });

  test('get_audit_log redacts a secret carried by a durable entry', async () => {
    expect(
      (
        await post({
          ...draft,
          key: 'mcp:audit-read:secret',
          payload: { effect: 'allow', detail: `key ${SECRET}` },
        })
      ).status,
    ).toBe(200);
    const daemon = startDaemon();
    try {
      const { tools } = await build(daemon.client, repo.audit);
      const text = JSON.stringify(await tools.getAuditLog({ afterSeq: 0, limit: 10 }));
      expect(text).not.toContain(SECRET);
      expect(text).toContain('[REDACTED:aws_key]');
    } finally {
      daemon.stop();
    }
  });

  test('tail_logs redacts a secret from the real daemon read', async () => {
    const daemon = startDaemon({ logs: ['line one', `key ${SECRET}`, 'last line'] });
    try {
      const { tools } = await build(daemon.client, repo.audit);
      const text = (await tools.tailLogs({ service: 'api', lines: 3 })) as string;
      expect(text).not.toContain(SECRET);
      expect(text).toContain('[REDACTED:aws_key]');
      expect(text).toContain('last line');
    } finally {
      daemon.stop();
    }
  });
});
