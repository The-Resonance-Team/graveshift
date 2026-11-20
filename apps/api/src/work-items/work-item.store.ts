import { type WorkItem } from '@graveshift/core';
import { Injectable } from '@nestjs/common';

import { SEED_WORK_ITEMS } from './work-item.fixtures';

/** In-memory store for runtime and tests. Persistence is deferred; no database is wired. */
@Injectable()
export class WorkItemStore {
  private readonly items = new Map<string, WorkItem>(
    SEED_WORK_ITEMS.map((item) => [item.id, item]),
  );

  list(): WorkItem[] {
    return [...this.items.values()];
  }

  get(id: string): WorkItem | undefined {
    return this.items.get(id);
  }

  save(item: WorkItem): void {
    this.items.set(item.id, item);
  }
}
