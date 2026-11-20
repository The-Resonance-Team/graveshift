import { RuleSchema } from '@graveshift/core';
import { z } from 'zod';

// Bound request size until authentication ships.
export const MAX_RULES_PER_LAYER = 200;

export const validateRulesRequestSchema = z
  .object({
    systemRules: z.array(RuleSchema).max(MAX_RULES_PER_LAYER),
    clientRules: z.array(RuleSchema).max(MAX_RULES_PER_LAYER),
    confirmOverrides: z.boolean().optional(),
  })
  .superRefine((rules, ctx) => {
    for (const layer of ['systemRules', 'clientRules'] as const) {
      const seen = new Set<string>();
      rules[layer].forEach((rule, index) => {
        if (seen.has(rule.id)) {
          ctx.addIssue({
            code: 'custom',
            path: [layer, index, 'id'],
            message: `Duplicate rule id ${rule.id} in ${layer}.`,
          });
        }
        seen.add(rule.id);
      });
    }
  });
export type ValidateRulesRequest = z.infer<typeof validateRulesRequestSchema>;

export const validateRulesResponseSchema = z.object({
  accepted: z.literal(true),
  overrideIds: z.array(z.string()),
  warning: z.string(),
});
export type ValidateRulesResponse = z.infer<typeof validateRulesResponseSchema>;
