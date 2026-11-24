import type { AuditDraft } from '@graveshift/core';
import type { Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import {
  dbTestEnabled,
  FIXTURE_AT,
  openTestDatabase,
  resetDatabase,
} from '../../../test/database/fixtures';
import { TEST_CONFIG } from '../../../test/fakes/auth-test-config';
import { AuditRepo } from '../../audit/audit.repo';
import type { PrismaService } from '../../infra/prisma.service';
import type { Principal } from '../auth.types';
import { CredentialService } from '../services/credential.service';
import { PrismaCredentialRepo } from './credential.repo';

const principal: Principal = {
  clientId: 'client-1',
  projectId: 'project-1',
  scopes: ['tokens:manage', 'incidents:read'],
};
const issue = (service: CredentialService) =>
  service.issue({ kind: 'mcp', name: 'reader', scopes: ['incidents:read'] }, principal);

class FailingAudit extends AuditRepo {
  override async appendInTx(
    tx: Prisma.TransactionClient,
    projectId: string,
    input: AuditDraft,
  ): Promise<never> {
    await super.appendInTx(tx, projectId, input);
    throw new Error('abort after audit append');
  }
}

describe.skipIf(!dbTestEnabled)('Postgres CredentialRepo', () => {
  let db: PrismaService;
  let observer: PrismaService;
  let audit: AuditRepo;
  let first: CredentialService;
  let second: CredentialService;

  beforeAll(async () => {
    db = await openTestDatabase();
    observer = await openTestDatabase();
    audit = new AuditRepo(db);
    first = new CredentialService(new PrismaCredentialRepo(db, audit), TEST_CONFIG);
    second = new CredentialService(
      new PrismaCredentialRepo(observer, new AuditRepo(observer)),
      TEST_CONFIG,
    );
  });
  beforeEach(async () => resetDatabase(db));
  afterAll(async () => {
    await db?.onModuleDestroy();
    await observer?.onModuleDestroy();
  });

  test('two API instances enforce one cap and return a value only for committed issues', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) => issue(index % 2 ? first : second)),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(10);
    expect(
      results.filter((result) => result.status === 'rejected' && result.reason.status === 409),
    ).toHaveLength(10);
    expect(await db.credential.count()).toBe(10);
    expect(await audit.verifyChain('project-1')).toEqual({ ok: true, length: 10 });
    const issued = results.find((result) => result.status === 'fulfilled');
    if (issued?.status !== 'fulfilled') throw new Error('Missing committed credential');
    const stored = await db.credential.findUniqueOrThrow({ where: { id: issued.value.id } });
    expect(stored.hash).not.toContain(issued.value.value);
    expect(JSON.stringify(await audit.list('project-1'))).not.toContain(issued.value.value);
    expect(JSON.stringify(await audit.list('project-1'))).not.toContain(stored.hash);
  }, 30_000);

  test('revocation is visible across clients and stays idempotent after restart', async () => {
    const issued = await issue(first);
    const verified = await second.verify(issued.value);
    expect(verified.expiresAt).toBe(issued.expiresAt);
    await second.revoke(issued.id, principal);
    await expect(first.verify(issued.value)).rejects.toHaveProperty('status', 401);
    await second.revoke(issued.id, principal);
    await observer.onModuleDestroy();
    observer = await openTestDatabase();
    second = new CredentialService(
      new PrismaCredentialRepo(observer, new AuditRepo(observer)),
      TEST_CONFIG,
    );
    await expect(second.verify(issued.value)).rejects.toHaveProperty('status', 401);
    expect((await second.list(principal))[0]?.revokedAt).not.toBeNull();
    expect(await audit.verifyChain('project-1')).toEqual({ ok: true, length: 2 });
  });

  test('issuance survives a client restart and foreign owners cannot list or revoke', async () => {
    const issued = await issue(first);
    await observer.onModuleDestroy();
    observer = await openTestDatabase();
    second = new CredentialService(
      new PrismaCredentialRepo(observer, new AuditRepo(observer)),
      TEST_CONFIG,
    );
    await expect(second.verify(issued.value)).resolves.toHaveProperty('id', issued.id);
    const foreign = { ...principal, projectId: 'project-2' };
    expect(await second.list(foreign)).toEqual([]);
    await expect(second.revoke(issued.id, foreign)).rejects.toHaveProperty('status', 404);
    await expect(
      second.revoke(issued.id, { ...principal, clientId: 'other' }),
    ).rejects.toHaveProperty('status', 404);
  });

  test('an audit failure rolls back both issue and revoke', async () => {
    const failing = new CredentialService(
      new PrismaCredentialRepo(db, new FailingAudit(db)),
      TEST_CONFIG,
    );
    await expect(issue(failing)).rejects.toThrow('abort after audit append');
    expect(await db.credential.count()).toBe(0);
    expect(await audit.list('project-1')).toEqual([]);
    const issued = await issue(first);
    await expect(failing.revoke(issued.id, principal)).rejects.toThrow('abort after audit append');
    await expect(second.verify(issued.value)).resolves.toHaveProperty('id', issued.id);
    expect(await audit.verifyChain('project-1')).toEqual({ ok: true, length: 1 });
  });

  test('expiry audit is stable across clients and a revoke frees the capped slot', async () => {
    const issued = await issue(first);
    await db.credential.update({
      where: { id: issued.id },
      data: { expiresAt: new Date(FIXTURE_AT) },
    });
    const results = await Promise.allSettled([
      first.verify(issued.value),
      second.verify(issued.value),
    ]);
    expect(
      results.every((result) => result.status === 'rejected' && result.reason.status === 401),
    ).toBe(true);
    expect(
      (await audit.list('project-1')).filter((entry) => entry.type === 'credential.expired'),
    ).toHaveLength(1);
    await Array.from({ length: 10 }).reduce(async (prior) => {
      await prior;
      await issue(first);
    }, Promise.resolve());
    await expect(issue(second)).rejects.toHaveProperty('status', 409);
    const active = (await second.list(principal)).find((record) => record.id !== issued.id);
    if (!active) throw new Error('Missing active fixture');
    await second.revoke(active.id, principal);
    await expect(issue(first)).resolves.toHaveProperty('value');
  }, 30_000);
});
