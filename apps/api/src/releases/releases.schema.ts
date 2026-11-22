import { z } from 'zod';

export const releaseSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  version: z.string(),
  createdAt: z.iso.datetime(),
  projectIds: z.array(z.string()),
});

export const releaseListSchema = z.array(releaseSchema);
