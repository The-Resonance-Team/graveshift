import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { HauntingController } from './haunting.controller';
import { HauntingRepo } from './haunting.repo';
import { HauntingService } from './haunting.service';

@Module({
  imports: [AuditModule],
  controllers: [HauntingController],
  providers: [HauntingRepo, HauntingService],
  exports: [HauntingRepo],
})
export class HauntingsModule {}
