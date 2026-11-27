import { z } from 'zod';

import { FixCompletionSchema } from './results';

export const WORK_LEASE_MS = 30_000;

const fence = {
  expectedVersion: z.number().int().min(0),
  attemptId: z.string().min(1),
  attemptVersion: z.number().int().min(0),
};

export const HeartbeatSchema = z
  .object({ attemptId: z.string().min(1), workerId: z.string().min(1).max(100) })
  .strict();
export type Heartbeat = z.infer<typeof HeartbeatSchema>;

export const HeartbeatResultSchema = z.object({ renewed: z.boolean() }).strict();
export type HeartbeatResult = z.infer<typeof HeartbeatResultSchema>;

export const AbandonSchema = z.object(fence).strict();
export type Abandon = z.infer<typeof AbandonSchema>;

export const AbortPublicationSchema = z.object({ ...fence, outcome: FixCompletionSchema }).strict();
export type AbortPublication = z.infer<typeof AbortPublicationSchema>;
