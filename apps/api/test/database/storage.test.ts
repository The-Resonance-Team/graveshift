import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, test } from 'bun:test';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { AuditRepo } from '../../src/audit/repo/audit.repo';
import { type AuditInput } from '../../src/audit/chain';
import { PrismaCredentialRepo } from '../../src/auth/repo/credential.repo';
import { CredentialService } from '../../src/auth/services/credential.service';
import { CreateCredentialDto } from '../../src/auth/dto/create-credential.dto';
import { PrismaService } from '../../src/infra/prisma.service';
import { TEST_CONFIG } from '../fakes/auth-test-config';

const url = process.env.DATABASE_URL;
if (!url || new URL(url).pathname !== '/graveshift_test' || new URL(url).hostname !== '127.0.0.1') {
  throw new Error(
    'Run database tests through bun run test:database with the isolated Docker database',
  );
}
const first = new PrismaService(new ConfigService({ DATABASE_URL: url }));
const second = new PrismaService(new ConfigService({ DATABASE_URL: url }));
const audit = new AuditRepo(first);
const otherAudit = new AuditRepo(second);
const repo = new PrismaCredentialRepo(first, audit);
const otherRepo = new PrismaCredentialRepo(second, otherAudit);
const service = new CredentialService(repo, TEST_CONFIG);
const otherService = new CredentialService(otherRepo, TEST_CONFIG);
const principal = () => ({
  tenantId: `test_${randomUUID()}`,
  clientId: 'test-client',
  scopes: ['tokens:manage', 'logs:read'],
});
const dto = () =>
  Object.assign(new CreateCredentialDto(), { kind: 'mcp', name: 'reader', scopes: ['logs:read'] });
afterAll(async () => {
  await first.onModuleDestroy();
  await second.onModuleDestroy();
});

describe('PostgreSQL credential and audit persistence', () => {
  test('survives a new connection and revocation applies across service instances', async () => {
    const owner = principal();
    const issued = await service.issue(dto(), owner);
    expect(await otherService.verify(issued.value)).toMatchObject({ clientId: owner.clientId });
    const rows = await otherService.list(owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('hash');
    expect(rows[0]).not.toHaveProperty('value');
    await otherService.revoke(issued.id, owner);
    await expect(service.verify(issued.value)).rejects.toThrow();
    expect((await audit.list(owner.tenantId)).map((entry) => entry.type)).toEqual([
      'credential.created',
      'credential.revoked',
    ]);
    expect(await audit.verifyChain(owner.tenantId)).toEqual({ ok: true, length: 2 });
  });

  test('the ten-credential cap holds across concurrent instances', async () => {
    const owner = principal();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 ? otherService : service).issue(dto(), owner),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(10);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(10);
    for (const result of rejected)
      if (result.status === 'rejected') expect(result.reason.status).toBe(409);
    expect(await first.credential.count({ where: { tenantId: owner.tenantId } })).toBe(10);
    expect(await audit.verifyChain(owner.tenantId)).toEqual({ ok: true, length: 10 });
  });

  test('audit failure rolls back a credential write', async () => {
    class FailingAudit extends AuditRepo {
      override async appendInTransaction(
        _tx: Prisma.TransactionClient,
        _tenantId: string,
        _input: AuditInput,
      ): Promise<never> {
        throw new Error('test audit write failed');
      }
    }
    const owner = principal();
    const failing = new CredentialService(
      new PrismaCredentialRepo(first, new FailingAudit(first)),
      TEST_CONFIG,
    );
    await expect(failing.issue(dto(), owner)).rejects.toThrow('test audit write failed');
    expect(await first.credential.count({ where: { tenantId: owner.tenantId } })).toBe(0);
  });

  test('records expiry once, including when two instances observe it', async () => {
    const owner = principal();
    const issued = await service.issue(dto(), owner);
    await first.credential.update({
      where: { id: issued.id },
      data: { expiresAt: new Date('2020-01-01T00:00:00.000Z') },
    });
    const attempts = await Promise.allSettled([
      service.verify(issued.value),
      otherService.verify(issued.value),
    ]);
    expect(attempts.every((attempt) => attempt.status === 'rejected')).toBe(true);
    const entries = await audit.list(owner.tenantId);
    expect(entries.map((entry) => entry.type)).toEqual([
      'credential.created',
      'credential.expired',
    ]);
    expect(JSON.stringify(entries)).not.toContain(issued.value);
  });

  test('database triggers block updates and deletes of audit entries', async () => {
    const owner = principal();
    await service.issue(dto(), owner);
    await expect(
      first.$executeRaw(
        Prisma.sql`UPDATE audit_entries SET actor = 'changed' WHERE tenant_id = ${owner.tenantId}`,
      ),
    ).rejects.toThrow('append-only');
    await expect(
      first.$executeRaw(Prisma.sql`DELETE FROM audit_entries WHERE tenant_id = ${owner.tenantId}`),
    ).rejects.toThrow('append-only');
    expect(await audit.verifyChain(owner.tenantId)).toEqual({ ok: true, length: 1 });
  });

  test('concurrent audit appends retain sequence and canonical JSON after persistence', async () => {
    const owner = principal();
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        (index % 2 ? audit : otherAudit).append({
          tenantId: owner.tenantId,
          actor: owner.clientId,
          type: 'test',
          payload: JSON.parse('{"__proto__":{"safe":true},"value":1}'),
        }),
      ),
    );
    expect(await audit.verifyChain(owner.tenantId)).toEqual({ ok: true, length: 8 });
    expect(
      (await audit.list(owner.tenantId, { afterSeq: 2, limit: 2 })).map((entry) => entry.seq),
    ).toEqual([3, 4]);
  });
});
