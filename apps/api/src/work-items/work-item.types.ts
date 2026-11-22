import type {
  WorkItem,
  WorkItemPriority,
  WorkItemSeverity,
  WorkItemStatus,
} from '@graveshift/core';
import type { WorkCaller } from '@graveshift/work';

/** The one API-side value for a fenced Work item state call. The HTTP wire shape is unchanged. */
export interface WorkStateCall<Input> {
  readonly caller: WorkCaller;
  readonly id: string;
  readonly input: Input;
}

export interface WorkListQuery {
  offset: number;
  limit: number;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  severity?: WorkItemSeverity;
  assignee?: string;
  service?: string;
}

export interface WorkItemListResponse {
  items: WorkItem[];
  total: number;
  offset: number;
  limit: number;
}
