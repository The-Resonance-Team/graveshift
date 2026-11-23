import { z } from 'zod';

import { FixTriggerSchema } from './results';
import { FixAttemptStateSchema, type WorkSnapshot } from './state';

export const RoutingSummarySchema = z
  .object({
    attemptId: z.string().min(1),
    questionId: z.string().min(1).nullable(),
    question: z.string().min(1).nullable(),
    missing: z.array(z.string().min(1)),
    agent: z.string().min(1),
    trigger: FixTriggerSchema,
    state: FixAttemptStateSchema,
  })
  .strict();
export type RoutingSummary = z.infer<typeof RoutingSummarySchema>;

export const WorkRoutingSchema = z.object({ routing: RoutingSummarySchema.nullable() }).strict();
export type WorkRouting = z.infer<typeof WorkRoutingSchema>;

export function workRouting(snapshot: WorkSnapshot): WorkRouting {
  const attempt = snapshot.activeAttempt;
  if (attempt === undefined) return { routing: null };
  const progress = attempt.state === 'awaiting_answer' ? attempt.routingProgress : null;
  return {
    routing: {
      attemptId: attempt.id,
      agent: attempt.agent,
      trigger: attempt.trigger,
      state: attempt.state,
      questionId: progress === null ? null : attempt.questionId,
      question: progress?.question ?? null,
      missing: progress?.missing ?? [],
    },
  };
}
