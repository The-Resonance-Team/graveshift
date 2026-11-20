import { WorkItemSchema } from '@graveshift/core';
import { z } from 'zod';

export const workItemParamsSchema = z.object({ id: z.string().min(1) }).strict();
export type WorkItemParams = z.infer<typeof workItemParamsSchema>;

export const listWorkItemsQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type ListWorkItemsQuery = z.infer<typeof listWorkItemsQuerySchema>;

export const workItemListResponseSchema = z.object({
  items: z.array(WorkItemSchema),
  total: z.number().int().min(0),
  offset: z.number().int().min(0),
  limit: z.number().int().min(1),
});
export type WorkItemListResponse = z.infer<typeof workItemListResponseSchema>;

export const triageRequestSchema = z.object({ assignee: z.string().min(1) }).strict();
export type TriageRequest = z.infer<typeof triageRequestSchema>;
