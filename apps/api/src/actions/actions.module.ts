import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ActionRepo } from './action.repo';
import { InternalActionsController } from './actions.controller';

@Module({
  imports: [AuditModule],
  controllers: [InternalActionsController],
  providers: [ActionRepo],
})
export class ActionsModule {}
