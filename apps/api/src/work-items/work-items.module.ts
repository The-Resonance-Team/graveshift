import { type WorkItem } from '@graveshift/core';
import { Module } from '@nestjs/common';

import { DEMO_WORK_ITEMS } from './work-item.fixtures';
import { createWorkItemPolicy, WORK_ITEM_POLICY } from './work-item.policy';
import { WORK_ITEM_SEED, WorkItemStore } from './work-item.store';
import { WorkItemsController } from './work-items.controller';

@Module({
  controllers: [WorkItemsController],
  providers: [
    WorkItemStore,
    {
      provide: WORK_ITEM_SEED,
      // No demo data in production. An explicit flag is the only way to seed the store.
      useFactory: (): readonly WorkItem[] =>
        process.env.GRAVESHIFT_WORK_ITEM_DEMO === 'true' ? DEMO_WORK_ITEMS : [],
    },
    { provide: WORK_ITEM_POLICY, useFactory: createWorkItemPolicy },
  ],
})
export class WorkItemsModule {}
