import { RuleSchema } from '@graveshift/core';
import { z } from 'zod';

export const validateRulesRequestSchema = z.object({
  systemRules: z.array(RuleSchema),
  clientRules: z.array(RuleSchema),
  confirmOverrides: z.boolean().optional(),
});
export type ValidateRulesRequest = z.infer<typeof validateRulesRequestSchema>;

export const validateRulesResponseSchema = z.object({
  accepted: z.literal(true),
  overrideIds: z.array(z.string()),
  warning: z.string(),
});
export type ValidateRulesResponse = z.infer<typeof validateRulesResponseSchema>;
