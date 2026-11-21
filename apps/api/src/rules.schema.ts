import { z } from 'zod';

// Zod stays only for OpenAPI response documentation. Request DTOs own validation.
export const validateRulesResponseSchema = z.object({
  accepted: z.literal(true),
  overrideIds: z.array(z.string()),
  warning: z.string(),
});
export type ValidateRulesResponse = z.infer<typeof validateRulesResponseSchema>;
