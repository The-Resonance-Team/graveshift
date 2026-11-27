import {
  GENESIS_HASH,
  makeAuditEntry,
  type AuditDraft,
  type AuditEntry,
  type VerifyResult,
  verifyEntries,
} from '@graveshift/core';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../infra/prisma.service';
import { AuditConflict } from './audit.errors';
import { auditFacts, normalizeDraft, toAuditEntry } from './audit.mapper';
import { AUDIT_SELECT } from './audit.select';
import {
  isAuditScopeUsable,
  type AuditReader,
  type AuditSink,
  type AuditTransaction,
} from './audit.sink';
import { inAuditTransaction } from './audit.transaction';
import type { AuditPage, PolicyUsage, UsageRow } from './audit.types';
import { parsePolicyUsage, usageQuery } from './audit.usage';

/**
 * The one Postgres implementation of the audit seams. It owns the hash chain from
 * `@graveshift/core`, eventKey dedup, the serializable retry and the authenticated scope
 * check. It is registered under `AUDIT_SINK` for writes and `AUDIT_READER` for reads; database
 * tests bind those seams to this same adapter.
 */
@Injectable()
export class AuditRepo implements AuditSink, AuditReader {
  constructor(private readonly prisma: PrismaService) {}

  /** ADR 0018: a write with no project or actor would land in a chain nobody owns. */
  private static assertScope(projectId: string, draft: AuditDraft): void {
    if (!isAuditScopeUsable({ projectId, actor: draft.actor })) {
      throw new Error('an audit entry needs the authenticated projectId and actor');
    }
  }

  append(projectId: string, draft: AuditDraft): Promise<AuditEntry> {
    AuditRepo.assertScope(projectId, draft);
    return this.transaction((tx) => this.appendInTx(tx, projectId, draft));
  }

  /** Repositories only. The caller owns a serializable, retryable transaction and commit. */
  appendInTx(tx: AuditTransaction, projectId: string, input: AuditDraft): Promise<AuditEntry> {
    AuditRepo.assertScope(projectId, input);
    const draft = normalizeDraft(input);
    return this.appendNormalizedInTx(tx, projectId, draft);
  }

  private async appendNormalizedInTx(
    tx: AuditTransaction,
    projectId: string,
    draft: ReturnType<typeof normalizeDraft>,
  ): Promise<AuditEntry> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${projectId}, 0))::text`;
    const prior = await tx.auditEntry.findUnique({
      where: { projectId_eventKey: { projectId, eventKey: draft.key } },
      select: AUDIT_SELECT,
    });
    if (prior) {
      const entry = toAuditEntry(prior);
      if (auditFacts(entry) !== auditFacts(draft)) throw new AuditConflict();
      return entry;
    }
    const head = await tx.auditEntry.findFirst({
      where: { projectId },
      orderBy: { seq: 'desc' },
      select: AUDIT_SELECT,
    });
    const prevHash = head?.hash ?? GENESIS_HASH;
    const entry = makeAuditEntry((head?.seq ?? 0) + 1, new Date().toISOString(), draft, prevHash);
    const row = await tx.auditEntry.create({
      data: {
        ...entry,
        at: new Date(entry.at),
        projectId,
        eventKey: draft.key,
        incidentId: entry.incidentId ?? null,
        // Adapter boundary: the validated Zod JSON value is the Prisma JSONB input.
        payload: entry.payload as Prisma.InputJsonValue,
      },
      select: AUDIT_SELECT,
    });
    return toAuditEntry(row);
  }

  transaction<Result>(work: (tx: AuditTransaction) => Promise<Result>): Promise<Result> {
    return inAuditTransaction(this.prisma, work);
  }

  async list(
    projectId: string,
    { afterSeq = 0, limit = 100 }: AuditPage = {},
  ): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditEntry.findMany({
      where: { projectId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      take: limit,
      select: AUDIT_SELECT,
    });
    return rows.map(toAuditEntry);
  }

  async verifyChain(projectId: string): Promise<VerifyResult> {
    const rows = await this.prisma.auditEntry.findMany({
      where: { projectId },
      orderBy: { seq: 'asc' },
      select: AUDIT_SELECT,
    });
    return verifyEntries(rows.map(toAuditEntry));
  }

  async policyUsage(projectId: string, service: string, incidentId: string): Promise<PolicyUsage> {
    const rows = await this.prisma.$queryRaw<UsageRow[]>(
      usageQuery(projectId, service, incidentId),
    );
    return parsePolicyUsage(rows);
  }
}
