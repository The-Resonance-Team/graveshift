import { Global, Module } from '@nestjs/common';

import { InternalAuditController } from './audit.controller';
import { PostgresAuditSink } from './audit.postgres.sink';
import { AuditRepo } from './audit.repo';
import { AUDIT_SINK } from './audit.sink';
import { AuditRepo as PlatformAuditRepo } from './repo/audit.repo';

/**
 * The platform audit chain stays global. The durable model-audit repository and
 * its internal append endpoint are layered on top of it.
 *
 * `AUDIT_SINK` is the only seam a use case uses to write an audit entry. `PostgresAuditSink`
 * is its only implementation: it writes through `AuditRepo.append` and refuses a record with
 * no authenticated scope, so an entry can never be written outside a Project's own chain.
 */
@Global()
@Module({
  controllers: [InternalAuditController],
  providers: [
    PlatformAuditRepo,
    AuditRepo,
    PostgresAuditSink,
    { provide: AUDIT_SINK, useExisting: PostgresAuditSink },
  ],
  exports: [PlatformAuditRepo, AuditRepo, AUDIT_SINK],
})
export class AuditModule {}
