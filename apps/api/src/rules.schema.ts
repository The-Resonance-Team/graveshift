import { RuleConfirmationSchema } from '@graveshift/core';
import { z } from 'zod';

// Zod stays only for OpenAPI response documentation. Request DTOs own validation.
export const validateRulesResponseSchema = RuleConfirmationSchema.extend({
  accepted: z.literal(true),
});
export const rulesConflictSchema = RuleConfirmationSchema.omit({ accepted: true });
export type ValidateRulesResponse = z.infer<typeof validateRulesResponseSchema>;
