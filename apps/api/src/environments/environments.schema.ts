import { z } from 'zod';

export const environmentSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});

export const environmentListSchema = z.array(environmentSchema);
