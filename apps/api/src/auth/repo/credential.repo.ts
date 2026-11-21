import { Injectable } from '@nestjs/common';
import { CredentialKind, type Credential, Prisma } from '@prisma/client';

import { AuditRepo } from '../../audit/repo/audit.repo';
import { PrismaService } from '../../infra/prisma.service';
import type { CredentialRecord, Principal } from '../auth.types';

export const MAX_ACTIVE_CREDENTIALS = 10;

export class CredentialLimitError extends Error {
  constructor() {
    super('The active credential limit is reached');
    this.name = 'CredentialLimitError';
  }
}

/** Domain verbs for the PostgreSQL credential table. */
export abstract class CredentialRepo {
  abstract list(principal: Principal): Promise<CredentialRecord[]>;
  abstract findByHash(hash: string): Promise<CredentialRecord | undefined>;
  abstract add(record: CredentialRecord): Promise<void>;
  abstract revoke(id: string, principal: Principal, at: string): Promise<boolean>;
  abstract recordExpiry(id: string, at: string): Promise<void>;
}

function toRecord(row: Credential): CredentialRecord {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    prefix: row.prefix,
    hash: row.hash,
    clientId: row.clientId,
    tenantId: row.tenantId,
    scopes: row.scopes,
    service: row.service,
    projectId: row.projectId,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    expirationAuditedAt: row.expirationAuditedAt?.toISOString() ?? null,
  };
}

function credentialData(record: CredentialRecord): Prisma.CredentialUncheckedCreateInput {
  return {
    ...record,
    kind: record.kind as CredentialKind,
    createdAt: new Date(record.createdAt),
    expiresAt: record.expiresAt === null ? null : new Date(record.expiresAt),
    revokedAt: record.revokedAt === null ? null : new Date(record.revokedAt),
    expirationAuditedAt:
      record.expirationAuditedAt === null ? null : new Date(record.expirationAuditedAt),
  };
}

async function lockCredentialWrites(
  tx: Prisma.TransactionClient,
  tenantId: string,
  clientId: string,
): Promise<void> {
  const key = `credential:${tenantId}:${clientId}`;
  await tx.$queryRaw(Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

@Injectable()
export class PrismaCredentialRepo extends CredentialRepo {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRepo,
  ) {
    super();
  }

  async list(principal: Principal): Promise<CredentialRecord[]> {
    const rows = await this.prisma.credential.findMany({
      where: { clientId: principal.clientId, tenantId: principal.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRecord);
  }

  async findByHash(hash: string): Promise<CredentialRecord | undefined> {
    const row = await this.prisma.credential.findFirst({ where: { hash } });
    return row === null ? undefined : toRecord(row);
  }

  async add(record: CredentialRecord): Promise<void> {
    await this.audit.transaction(async (tx) => {
      await lockCredentialWrites(tx, record.tenantId, record.clientId);
      const now = new Date(record.createdAt);
      const active = await tx.credential.count({
        where: {
          clientId: record.clientId,
          tenantId: record.tenantId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      });
      if (active >= MAX_ACTIVE_CREDENTIALS) throw new CredentialLimitError();

      await tx.credential.create({ data: credentialData(record) });
      await this.audit.appendInTransaction(tx, record.tenantId, {
        actor: record.clientId,
        type: 'credential.created',
        payload: {
          credentialId: record.id,
          kind: record.kind,
          name: record.name,
          scopes: record.scopes,
          service: record.service,
          expiresAt: record.expiresAt,
        },
      });
    });
  }

  async revoke(id: string, principal: Principal, at: string): Promise<boolean> {
    return this.audit.transaction(async (tx) => {
      await lockCredentialWrites(tx, principal.tenantId, principal.clientId);
      const record = await tx.credential.findFirst({
        where: { id, clientId: principal.clientId, tenantId: principal.tenantId },
      });
      if (record === null) return false;
      if (record.revokedAt !== null) return true;

      const changed = await tx.credential.updateMany({
        where: { id, clientId: principal.clientId, tenantId: principal.tenantId, revokedAt: null },
        data: { revokedAt: new Date(at) },
      });
      if (changed.count === 0) return true;
      await this.audit.appendInTransaction(tx, record.tenantId, {
        actor: principal.clientId,
        type: 'credential.revoked',
        payload: { credentialId: record.id, kind: record.kind, name: record.name },
      });
      return true;
    });
  }

  async recordExpiry(id: string, at: string): Promise<void> {
    await this.audit.transaction(async (tx) => {
      const record = await tx.credential.findUnique({ where: { id } });
      if (
        record === null ||
        record.revokedAt !== null ||
        record.expirationAuditedAt !== null ||
        record.expiresAt === null ||
        record.expiresAt.getTime() > Date.parse(at)
      ) {
        return;
      }

      const changed = await tx.credential.updateMany({
        where: {
          id,
          revokedAt: null,
          expirationAuditedAt: null,
          expiresAt: { lte: new Date(at) },
        },
        data: { expirationAuditedAt: new Date(at) },
      });
      if (changed.count === 0) return;
      await this.audit.appendInTransaction(tx, record.tenantId, {
        actor: 'system',
        type: 'credential.expired',
        payload: { credentialId: record.id, kind: record.kind, name: record.name },
      });
    });
  }
}
