import type { GraveshiftConfig } from '@graveshift/config';
import { WORK_COMMANDS } from '@graveshift/work';
import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { BOOT_CONFIG, type RootBootConfig } from '../config/boot.config';
import { GRAVESHIFT_CONFIG } from '../config/config.provider';
import { AuditedWorkCommands, WORK_COMMANDS_INNER } from '../fix/audited-work.commands';
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
    AuditedWorkCommands,
    // The audited boundary is the only command surface a controller may use: it denies a Fix
    // command with no authenticated audit scope before the daemon is called and writes the one
    // outcome entry per attempt. Tests replace only the inner transport.
    { provide: WORK_COMMANDS, useExisting: AuditedWorkCommands },
    { provide: WORK_COMMANDS_INNER, useExisting: DaemonWorkClient },
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
