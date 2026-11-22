import { Global, Module } from '@nestjs/common';

import { InternalAuditController } from './audit.controller';
import { AuditRepo } from './audit.repo';
import { AuditRepo as PlatformAuditRepo } from './repo/audit.repo';

/**
 * The platform audit chain stays global. The durable model-audit repository and
 * its internal append endpoint are layered on top of it.
 */
@Global()
@Module({
  controllers: [InternalAuditController],
  providers: [PlatformAuditRepo, AuditRepo],
  exports: [PlatformAuditRepo, AuditRepo],
})
export class AuditModule {}
