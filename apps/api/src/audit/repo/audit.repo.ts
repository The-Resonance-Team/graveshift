import {
  AuditEntrySchema,
  GENESIS_HASH,
  makeAuditEntry,
  type AuditInput,
  type VerifyResult,
  verifyEntries,
} from '@graveshift/core';
import { Injectable } from '@nestjs/common';
import { Prisma, type AuditEntry as PrismaAuditEntry } from '@prisma/client';

import { PrismaService } from '../../infra/prisma.service';

type AuditTransaction = Prisma.TransactionClient;

export interface AuditAppendInput extends AuditInput {
  projectId: string;
}

const toEntry = (row: PrismaAuditEntry) =>
  AuditEntrySchema.parse({
    seq: row.seq,
    at: row.at.toISOString(),
    actor: row.actor,
    type: row.type,
    ...(row.incidentId === null ? {} : { incidentId: row.incidentId }),
    payload: row.payload,
    prevHash: row.prevHash,
    hash: row.hash,
  });

/** Owns the PostgreSQL audit chain and its ordered projections. */
@Injectable()
export class AuditRepo {
  constructor(private readonly prisma: PrismaService) {}

  append(input: AuditAppendInput) {
    return this.transaction((tx) => this.appendInTransaction(tx, input.projectId, input));
  }

  async transaction<T>(write: (tx: AuditTransaction) => Promise<T>, attempt = 0): Promise<T> {
    try {
      return await this.prisma.$transaction(write, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 10_000,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2034' ||
        attempt >= 19
      )
        throw error;
      return this.transaction(write, attempt + 1);
    }
  }

  async appendInTransaction(tx: AuditTransaction, projectId: string, input: AuditInput) {
    await tx.$queryRaw(
      Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${projectId}, 0))`,
    );
    const last = await tx.auditEntry.findFirst({ where: { projectId }, orderBy: { seq: 'desc' } });
    const prevHash = last?.hash ?? GENESIS_HASH;
    const entry = makeAuditEntry((last?.seq ?? 0) + 1, new Date().toISOString(), input, prevHash);
    return toEntry(
      await tx.auditEntry.create({
        data: {
          projectId,
          seq: entry.seq,
          at: new Date(entry.at),
          actor: entry.actor,
          type: entry.type,
          incidentId: entry.incidentId ?? null,
          payload: entry.payload as Prisma.InputJsonValue,
          prevHash: entry.prevHash,
          hash: entry.hash,
        },
      }),
    );
  }

  async list(projectId: string, { afterSeq = 0, limit = 100 } = {}) {
    const rows = await this.prisma.auditEntry.findMany({
      where: { projectId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      take: limit,
    });
    return rows.map(toEntry);
  }

  async verifyChain(projectId: string): Promise<VerifyResult> {
    const rows = await this.prisma.auditEntry.findMany({
      where: { projectId },
      orderBy: { seq: 'asc' },
    });
    return verifyEntries(rows.map(toEntry));
  }
}
