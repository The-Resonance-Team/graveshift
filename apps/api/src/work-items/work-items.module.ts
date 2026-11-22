import type { GraveshiftConfig } from '@graveshift/config';
import { WORK_COMMANDS } from '@graveshift/work';
import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { BOOT_CONFIG, type RootBootConfig } from '../config/boot.config';
import { GRAVESHIFT_CONFIG } from '../config/config.provider';
import { DaemonWorkClient } from '../fix/daemon-work.client';
import { HauntingsModule } from '../hauntings/hauntings.module';
import { InternalWorkController } from './controllers/internal-work.controller';
import { WorkIngressController } from './controllers/work-ingress.controller';
import { WorkItemsController } from './controllers/work-items.controller';
import {
  createWorkItemPolicy,
  gateAutoFix,
  WORK_AGENTS,
  WORK_ITEM_POLICY,
} from './work-item.policy';
import { WorkItemRepo } from './work-item.repo';
import { WorkIngressService } from './work-ingress.service';

@Module({
  imports: [AuditModule, HauntingsModule],
  controllers: [WorkItemsController, WorkIngressController, InternalWorkController],
  providers: [
    WorkItemRepo,
    WorkIngressService,
    DaemonWorkClient,
    { provide: WORK_COMMANDS, useExisting: DaemonWorkClient },
    {
      provide: WORK_AGENTS,
      inject: [BOOT_CONFIG, GRAVESHIFT_CONFIG],
      useFactory: (config: RootBootConfig, full: GraveshiftConfig) =>
        gateAutoFix(config.agents, full.fix.enabled),
    },
    { provide: WORK_ITEM_POLICY, useFactory: createWorkItemPolicy, inject: [GRAVESHIFT_CONFIG] },
  ],
  exports: [WorkItemRepo, WORK_COMMANDS],
})
export class WorkItemsModule {}
