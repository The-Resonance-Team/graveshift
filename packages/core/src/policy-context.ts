import { z } from 'zod';

export const PolicyCountersSchema = z.strictObject({
  openPrsLastHour: z.number().int().min(0),
  actionsLast10Min: z.number().int().min(0),
  diagnosisLoops: z.number().int().min(0),
  llmSpentTodayUsd: z.number().min(0),
});
export type PolicyCounters = z.infer<typeof PolicyCountersSchema>;

/** Complete facts required by the policy engine. Missing counters are never inferred. */
export const SharedPolicyContextSchema = z
  .strictObject({
    service: z.string().min(1),
    category: z.string().min(1).optional(),
    signals: z.array(z.string().min(1)),
    confidence: z.number().min(0).max(1),
    envMode: z.string().min(1).optional(),
    counters: PolicyCountersSchema,
  })
  .transform(({ category, envMode, ...facts }) => ({
    ...facts,
    ...(category === undefined ? {} : { category }),
    ...(envMode === undefined ? {} : { envMode }),
  }));
export type SharedPolicyContext = z.infer<typeof SharedPolicyContextSchema>;
