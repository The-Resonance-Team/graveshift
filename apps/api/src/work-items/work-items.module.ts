import { type WorkItem } from '@graveshift/core';
import { Module } from '@nestjs/common';

import { GRAVESHIFT_CONFIG } from '../config/config.provider';
import { createFixDeps } from '../fix/fix.deps';
import { FixService } from '../fix/fix.service';
import { FIX_DEPS } from '../fix/fix.types';
import { DEMO_WORK_ITEMS } from './work-item.fixtures';
import { createWorkItemPolicy, WORK_ITEM_POLICY } from './work-item.policy';
import { WorkItemScopeGuard } from './work-item.scope.guard';
import { WORK_ITEM_SEED, WorkItemStore } from './work-item.store';
import { WorkItemsController } from './work-items.controller';

@Module({
  controllers: [WorkItemsController],
  providers: [
    WorkItemStore,
    FixService,
    WorkItemScopeGuard,
    { provide: FIX_DEPS, useFactory: createFixDeps, inject: [GRAVESHIFT_CONFIG] },
    {
      provide: WORK_ITEM_SEED,
      // No demo data in production. An explicit flag is the only way to seed the store.
      useFactory: (): readonly WorkItem[] =>
        process.env.GRAVESHIFT_WORK_ITEM_DEMO === 'true' ? DEMO_WORK_ITEMS : [],
    },
    { provide: WORK_ITEM_POLICY, useFactory: createWorkItemPolicy, inject: [GRAVESHIFT_CONFIG] },
  ],
})
export class WorkItemsModule {}
