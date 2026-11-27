import { WorkItemSchema } from '@graveshift/core';
import { z } from 'zod';

export const FromHauntingSchema = z
  .object({
    projectId: z.string().min(1),
    eventId: z.string().min(1).max(180),
    incidentId: z.string().min(1),
  })
  .strict();
export type FromHaunting = z.infer<typeof FromHauntingSchema>;

export const CreatedWorkResultSchema = z
  .object({ item: WorkItemSchema, created: z.boolean() })
  .strict();
export type CreatedWorkResult = z.infer<typeof CreatedWorkResultSchema>;
