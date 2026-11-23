import { z } from 'zod';

export const deploySchema = z.object({
  orgId: z.string(),
  projectId: z.string(),
  deploymentId: z.string().regex(/^[0-9a-f]{40}$/),
  environment: z.string(),
  title: z.string(),
  dateStarted: z.iso.datetime(),
  dateFinished: z.iso.datetime().nullable(),
  url: z.string().nullable(),
  closedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const deployListSchema = z.array(deploySchema);
