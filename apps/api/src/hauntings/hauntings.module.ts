import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { DeploysModule } from '../deploys/deploys.module';
import { HauntingController } from './haunting.controller';
import { HauntingRepo } from './haunting.repo';
import { HauntingService } from './haunting.service';

@Module({
  imports: [AuditModule, DeploysModule],
  controllers: [HauntingController],
  providers: [HauntingRepo, HauntingService],
  exports: [HauntingRepo],
})
export class HauntingsModule {}
