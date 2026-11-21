import { type WorkItem } from '@graveshift/core';
import { Inject, Injectable } from '@nestjs/common';

export const WORK_ITEM_SEED = Symbol('WORK_ITEM_SEED');

/** In-memory store for runtime and tests. Persistence is deferred; no database is wired. */
@Injectable()
export class WorkItemStore {
  private readonly items: Map<string, WorkItem>;

  constructor(@Inject(WORK_ITEM_SEED) seed: readonly WorkItem[]) {
    this.items = new Map(seed.map((item) => [item.id, item]));
  }

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
