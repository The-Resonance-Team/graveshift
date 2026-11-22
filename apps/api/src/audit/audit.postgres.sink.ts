import { Injectable } from '@nestjs/common';

import { AuditRepo } from './audit.repo';
import { isAuditScopeUsable, type AuditRecord, type AuditSink } from './audit.sink';

/**
 * The real sink. Every audit write goes through `AuditRepo.append`, the owner of the
 * PostgreSQL append-only chain. It adds no store, no cache and no fallback of its own.
 */
@Injectable()
export class PostgresAuditSink implements AuditSink {
  constructor(private readonly repo: AuditRepo) {}

  async append(record: AuditRecord): Promise<void> {
    // ADR 0018: the chain is keyed by the authenticated caller's projectId. A write with no
    // scope would land in a chain nobody owns and nobody can read back, so it is refused and
    // the caller fails closed instead of reporting a side effect it cannot account for.
    if (!isAuditScopeUsable({ projectId: record.projectId, actor: record.actor })) {
      throw new Error('an audit entry needs the authenticated projectId and actor');
    }
    await this.repo.append(record.projectId, record);
  }
}
