import { Global, Module } from '@nestjs/common';

import { InternalAuditController } from './audit.controller';
import { AuditRepo } from './audit.repo';
import { AUDIT_READER, AUDIT_SINK } from './audit.sink';

/**
 * The platform audit chain stays global. `AuditRepo` is the one Postgres implementation of
 * both seams: `AUDIT_SINK` for every write and `AUDIT_READER` for the ordered projections.
 * It owns the chain from `@graveshift/core`, eventKey dedup, serializable retry and the
 * authenticated scope check. Tests replace it at the same seams with an in-memory adapter.
 */
@Global()
@Module({
  controllers: [InternalAuditController],
  providers: [
    AuditRepo,
    { provide: AUDIT_SINK, useExisting: AuditRepo },
    { provide: AUDIT_READER, useExisting: AuditRepo },
  ],
  exports: [AuditRepo, AUDIT_SINK, AUDIT_READER],
})
export class AuditModule {}
