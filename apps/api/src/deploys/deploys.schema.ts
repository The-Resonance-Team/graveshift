import { z } from 'zod';

export const deploySchema = z.object({
  id: z.string(),
  orgId: z.string(),
  releaseId: z.string(),
  environmentId: z.string(),
  environment: z.string(),
  name: z.string(),
  dateStarted: z.iso.datetime(),
  dateFinished: z.iso.datetime().nullable(),
  url: z.string().nullable(),
  createdAt: z.iso.datetime(),
  projectIds: z.array(z.string()),
});

export const deployListSchema = z.array(deploySchema);
