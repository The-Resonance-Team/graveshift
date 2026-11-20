import { Module } from '@nestjs/common';

import { createWorkItemPolicy, WORK_ITEM_POLICY } from './work-item.policy';
import { WorkItemStore } from './work-item.store';
import { WorkItemsController } from './work-items.controller';

@Module({
  controllers: [WorkItemsController],
  providers: [WorkItemStore, { provide: WORK_ITEM_POLICY, useFactory: createWorkItemPolicy }],
})
export class WorkItemsModule {}
