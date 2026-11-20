import { z } from 'zod';

export const MODES = ['dry-run', 'propose', 'act'] as const;
export const ModeSchema = z.enum(MODES);
export type Mode = z.infer<typeof ModeSchema>;

const names = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);
const strings = z.array(z.string().min(1));

export const RuleSchema = z.object({
  id: z.string().min(1),
  action: names,
  when: z
    .object({
      category: strings.optional(),
      services: strings.optional(),
      signals: strings.optional(),
    })
    .optional(),
  params: z
    .object({
      replicas: z.object({ min: z.number().int().min(0), max: z.number().int().min(0) }).optional(),
    })
    .optional(),
  effect: z.enum(['allow', 'require_approval', 'deny']),
});
export type Rule = z.infer<typeof RuleSchema>;

export const PolicySchema = z
  .object({
    version: z.literal(1),
    mode: ModeSchema,
    approvers: z.object({ discordUserIds: strings, discordRoleIds: strings }),
    limits: z.object({
      maxOpenPrsPerHour: z.number().int().min(0),
      maxActionsPerServicePer10Min: z.number().int().min(0),
      maxDiagnosisLoops: z.number().int().min(0),
      llmDailyBudgetUsd: z.number().min(0),
    }),
    llm: z.object({
      minConfidenceForPr: z.number().min(0).max(1),
      minConfidenceForAction: z.number().min(0).max(1),
    }),
    github: z.object({
      repos: z.array(
        z.object({
          repo: z.string().min(1),
          services: strings,
          baseBranch: z.string().min(1),
          branchPrefix: z.string().min(1),
          draft: z.literal(true),
          allowedPaths: strings,
          forbiddenPaths: strings,
          maxFilesChanged: z.number().int().min(1),
          maxLinesChanged: z.number().int().min(1),
        }),
      ),
    }),
    rules: z.array(RuleSchema),
    default: z.literal('deny'),
  })
  .superRefine((policy, ctx) => {
    const seen = new Set<string>();
    policy.rules.forEach((rule, index) => {
      if (seen.has(rule.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rules', index, 'id'],
          message: 'duplicate rule id',
        });
      }
      seen.add(rule.id);
    });
  });
export type Policy = z.infer<typeof PolicySchema>;
