import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { AuditRepo } from '../../src/audit/audit.repo';
import { inAuditTransaction } from '../../src/audit/audit.transaction';
import type { PrismaService } from '../../src/infra/prisma.service';
import {
  FIXTURE_AT,
  dbTestEnabled,
  modelCounts,
  openTestDatabase,
  resetDatabase,
} from './fixtures';

const draft = {
  key: 'credential:create:1',
  actor: 'fixture',
  type: 'credential.created',
  payload: { id: 'credential-1' },
};
const credential = {
  id: 'credential-1',
  projectId: 'project-1',
  kind: 'mcp',
  name: 'Fixture',
  prefix: 'fixture',
  hash: 'unusable-fixture-hash',
  clientId: 'client-1',
  scopes: ['audit:read'],
  createdAt: new Date(FIXTURE_AT),
} as const;
let db: PrismaService;
let audit: AuditRepo;

describe.skipIf(!dbTestEnabled)('Postgres audit transaction composition', () => {
  beforeAll(async () => {
    db = await openTestDatabase();
    audit = new AuditRepo(db);
  });
  beforeEach(async () => resetDatabase(db));
  afterAll(async () => db.onModuleDestroy());

  test('one repository transaction commits the Credential and its audit row', async () => {
    const result = await inAuditTransaction(db, async (tx) => {
      await tx.credential.create({ data: { ...credential, scopes: [...credential.scopes] } });
      return audit.appendInTx(tx, 'project-1', draft);
    });
    expect(result.seq).toBe(1);
    expect(await modelCounts(db)).toMatchObject({ auditEntry: 1, credential: 1, workItem: 0 });
    expect(await audit.verifyChain('project-1')).toEqual({ ok: true, length: 1 });
  });

  test('failure after both writes rolls back both and leaves no sequence gap', async () => {
    const failure = new Error('abort the owned unit');
    await expect(
      inAuditTransaction(db, async (tx) => {
        await tx.credential.create({ data: { ...credential, scopes: [...credential.scopes] } });
        await audit.appendInTx(tx, 'project-1', draft);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await modelCounts(db)).toMatchObject({ auditEntry: 0, credential: 0, workItem: 0 });
    expect((await audit.append('project-1', draft)).seq).toBe(1);
  });

  test('an audit key conflict rolls back the related Credential write', async () => {
    await audit.append('project-1', draft);
    await expect(
      inAuditTransaction(db, async (tx) => {
        await tx.credential.create({ data: { ...credential, scopes: [...credential.scopes] } });
        await audit.appendInTx(tx, 'project-1', { ...draft, actor: 'different' });
      }),
    ).rejects.toHaveProperty('code', 'AUDIT_KEY_CONFLICT');
    expect(await modelCounts(db)).toMatchObject({ auditEntry: 1, credential: 0, workItem: 0 });
  });

  test('a Credential constraint failure rolls back audit and is not retried as audit contention', async () => {
    await db.credential.create({ data: { ...credential, scopes: [...credential.scopes] } });
    let attempts = 0;
    await expect(
      inAuditTransaction(db, async (tx) => {
        attempts += 1;
        await audit.appendInTx(tx, 'project-1', draft);
        await tx.credential.create({ data: { ...credential, scopes: [...credential.scopes] } });
      }),
    ).rejects.toHaveProperty('code', 'P2002');
    expect(attempts).toBe(1);
    expect(await modelCounts(db)).toMatchObject({ auditEntry: 0, credential: 1, workItem: 0 });
  });

  test('appendInTx stays invisible outside its transaction until the complete unit commits', async () => {
    const staged = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const pending = inAuditTransaction(db, async (tx) => {
      await tx.credential.create({ data: { ...credential, scopes: [...credential.scopes] } });
      const entry = await audit.appendInTx(tx, 'project-1', draft);
      staged.resolve();
      await release.promise;
      return entry;
    });
    try {
      await staged.promise;
      expect(await modelCounts(db)).toMatchObject({ auditEntry: 0, credential: 0, workItem: 0 });
    } finally {
      release.resolve();
    }
    const entry = await pending;
    expect(await audit.list('project-1')).toEqual([entry]);
    expect(await modelCounts(db)).toMatchObject({ auditEntry: 1, credential: 1, workItem: 0 });
  });
});
