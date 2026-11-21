import { Global, Module } from '@nestjs/common';

import { AuditRepo } from './repo/audit.repo';

@Global()
@Module({ providers: [AuditRepo], exports: [AuditRepo] })
export class AuditModule {}
